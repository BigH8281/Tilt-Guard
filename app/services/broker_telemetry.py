from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.broker_telemetry_event import BrokerTelemetryEvent
from app.models.user import User
from app.schemas.broker_telemetry import (
    BrokerTelemetryBatchIngestRequest,
    BrokerTelemetryBatchIngestResponse,
    BrokerTelemetryEventListResponse,
    BrokerTelemetryIngestResult,
    BrokerTelemetryLatestRead,
    BrokerTelemetryLatestResponse,
)

FRESH_TELEMETRY_WINDOW_SECONDS = 30
STALE_TELEMETRY_WINDOW_SECONDS = 120
DISPLAY_CONTEXT_GRACE_SECONDS = 12
LATEST_DERIVATION_LIMIT = 12
TRANSITIONAL_EVENT_TYPES = {
    "tradingview_tab_detected",
    "trading_panel_visible",
    "account_manager_control_visible",
    "order_entry_control_visible",
    "panel_open_control_visible",
    "panel_maximize_control_visible",
}


def _normalize_occurred_at(occurred_at: datetime) -> datetime:
    if occurred_at.tzinfo is None:
        return occurred_at.replace(tzinfo=timezone.utc)
    return occurred_at


def _snapshot_value(snapshot: dict, key: str) -> str | None:
    generic = snapshot.get("generic") or {}
    broker = snapshot.get("broker") or {}
    value = generic.get(key)
    if not value:
        value = broker.get(key)
    return value if isinstance(value, str) and value else None


def _normalize_snapshot(snapshot: dict) -> dict:
    if "generic" in snapshot:
        return {
            "generic": {
                "is_tradingview_chart": snapshot.get("generic", {}).get("is_tradingview_chart", False),
                "trading_surface_visible": snapshot.get("generic", {}).get("trading_surface_visible", False),
                "trading_panel_visible": snapshot.get("generic", {}).get("trading_panel_visible", False),
                "current_symbol": snapshot.get("generic", {}).get("current_symbol"),
                "account_manager_entrypoint_visible": snapshot.get("generic", {}).get(
                    "account_manager_entrypoint_visible", False
                ),
                "broker_selector_visible": snapshot.get("generic", {}).get("broker_selector_visible", False),
                "order_entry_control_visible": snapshot.get("generic", {}).get("order_entry_control_visible", False),
                "panel_open_control_visible": snapshot.get("generic", {}).get("panel_open_control_visible", False),
                "panel_maximize_control_visible": snapshot.get("generic", {}).get(
                    "panel_maximize_control_visible", False
                ),
            },
            "broker": {
                "broker_connected": snapshot.get("broker", {}).get("broker_connected", False),
                "broker_label": snapshot.get("broker", {}).get("broker_label"),
                "current_account_name": snapshot.get("broker", {}).get("current_account_name"),
                "fxcm_footer_cluster_visible": snapshot.get("broker", {}).get("fxcm_footer_cluster_visible", False),
                "anchor_summary": snapshot.get("broker", {}).get("anchor_summary") or {},
            },
        }

    return {
        "generic": {
            "is_tradingview_chart": snapshot.get("is_tradingview_chart", False),
            "trading_surface_visible": snapshot.get("trading_surface_visible", False),
            "trading_panel_visible": snapshot.get("trading_panel_visible", False),
            "current_symbol": snapshot.get("current_symbol"),
            "account_manager_entrypoint_visible": snapshot.get("account_manager_control_visible", False),
            "broker_selector_visible": snapshot.get("broker_selector_visible", False),
            "order_entry_control_visible": snapshot.get("order_entry_control_visible", False),
            "panel_open_control_visible": snapshot.get("panel_open_control_visible", False),
            "panel_maximize_control_visible": snapshot.get("panel_maximize_control_visible", False),
        },
        "broker": {
            "broker_connected": snapshot.get("broker_connected", False),
            "broker_label": snapshot.get("broker_label"),
            "current_account_name": snapshot.get("current_account_name"),
            "fxcm_footer_cluster_visible": snapshot.get("fxcm_footer_cluster_visible", False),
            "anchor_summary": snapshot.get("anchor_summary") or {},
        },
    }


def _is_recent_context_candidate(
    event: BrokerTelemetryEvent,
    latest_event: BrokerTelemetryEvent,
    latest_occurred_at: datetime,
) -> bool:
    if event.observation_key != latest_event.observation_key:
        return False

    if event.page_url != latest_event.page_url:
        return False

    occurred_at = _normalize_occurred_at(event.occurred_at)
    return occurred_at >= latest_occurred_at - timedelta(seconds=DISPLAY_CONTEXT_GRACE_SECONDS)


def _has_strong_broker_context(snapshot: dict) -> bool:
    broker = snapshot.get("broker") or {}
    return bool(
        broker.get("broker_connected") and broker.get("broker_label") and broker.get("fxcm_footer_cluster_visible")
    )


def _select_display_snapshot(events: list[BrokerTelemetryEvent], latest_event: BrokerTelemetryEvent) -> dict:
    latest_snapshot = _normalize_snapshot(dict(latest_event.snapshot))
    latest_occurred_at = _normalize_occurred_at(latest_event.occurred_at)
    recent_events = [
        event for event in events if _is_recent_context_candidate(event, latest_event, latest_occurred_at)
    ]

    display_snapshot = dict(latest_snapshot)

    # TradingView often emits a fresh transitional remount event before the account manager and
    # symbol header settle back into view. Within a very short same-page window, keep the most
    # recent stronger optional identity fields instead of letting the UI flicker to blank.
    for key in ("current_symbol", "current_account_name"):
        if _snapshot_value(display_snapshot, key):
            continue

        for event in recent_events:
            candidate = _snapshot_value(_normalize_snapshot(event.snapshot), key)
            if candidate:
                target = "generic" if key == "current_symbol" else "broker"
                display_snapshot[target][key] = candidate
                break

    latest_is_transitional = latest_event.event_type in TRANSITIONAL_EVENT_TYPES
    latest_is_partial = not _has_strong_broker_context(latest_snapshot)
    if not latest_is_transitional or not latest_is_partial:
        return display_snapshot

    for event in recent_events:
        if event.event_type == "broker_disconnected":
            continue

        candidate_snapshot = _normalize_snapshot(event.snapshot)
        if not _has_strong_broker_context(candidate_snapshot):
            continue

        display_snapshot["broker"].update(candidate_snapshot.get("broker") or {})
        break

    return display_snapshot


def _derive_status(snapshot: dict, *, freshness_seconds: int, is_fresh: bool) -> str:
    if is_fresh and (snapshot.get("broker") or {}).get("broker_connected"):
        return "live"

    if freshness_seconds <= STALE_TELEMETRY_WINDOW_SECONDS:
        return "attention"

    return "offline"


def ingest_broker_telemetry_events(
    db: Session,
    user: User,
    payload: BrokerTelemetryBatchIngestRequest,
) -> BrokerTelemetryBatchIngestResponse:
    requested_event_ids = [event.event_id for event in payload.events]
    existing_event_ids = set(
        db.scalars(
            select(BrokerTelemetryEvent.event_id).where(BrokerTelemetryEvent.event_id.in_(requested_event_ids))
        )
    )

    results: list[BrokerTelemetryIngestResult] = []
    accepted = 0

    for event in payload.events:
        if event.event_id in existing_event_ids:
            results.append(BrokerTelemetryIngestResult(event_id=event.event_id, status="duplicate"))
            continue

        stored_event = BrokerTelemetryEvent(
            user_id=user.id,
            event_id=event.event_id,
            event_type=event.event_type,
            source=event.source,
            platform=event.platform,
            broker_adapter=event.broker_adapter,
            observation_key=event.observation_key,
            page_url=event.page_url,
            page_title=event.page_title,
            occurred_at=event.occurred_at,
            snapshot=event.snapshot.model_dump(mode="json"),
            details={
                **(event.details or {}),
                "tab_id": event.tab_id,
            },
        )
        db.add(stored_event)
        existing_event_ids.add(event.event_id)
        accepted += 1
        results.append(BrokerTelemetryIngestResult(event_id=event.event_id, status="inserted"))

    db.commit()
    return BrokerTelemetryBatchIngestResponse(accepted=accepted, results=results)


def list_broker_telemetry_events(
    db: Session,
    user: User,
    *,
    limit: int,
    event_type: str | None = None,
    broker_adapter: str | None = None,
) -> BrokerTelemetryEventListResponse:
    statement = (
        select(BrokerTelemetryEvent)
        .where(BrokerTelemetryEvent.user_id == user.id)
        .order_by(desc(BrokerTelemetryEvent.occurred_at), desc(BrokerTelemetryEvent.id))
        .limit(limit)
    )

    if event_type:
        statement = statement.where(BrokerTelemetryEvent.event_type == event_type)

    if broker_adapter:
        statement = statement.where(BrokerTelemetryEvent.broker_adapter == broker_adapter)

    events = list(db.scalars(statement))
    return BrokerTelemetryEventListResponse(events=events)


def get_latest_broker_telemetry(
    db: Session,
    user: User,
    *,
    broker_adapter: str | None = None,
) -> BrokerTelemetryLatestResponse:
    statement = (
        select(BrokerTelemetryEvent)
        .where(BrokerTelemetryEvent.user_id == user.id)
        .order_by(desc(BrokerTelemetryEvent.occurred_at), desc(BrokerTelemetryEvent.id))
        .limit(LATEST_DERIVATION_LIMIT)
    )

    if broker_adapter:
        statement = statement.where(BrokerTelemetryEvent.broker_adapter == broker_adapter)

    events = list(db.scalars(statement))
    if not events:
        return BrokerTelemetryLatestResponse(telemetry=None)

    latest_event = events[0]
    occurred_at = _normalize_occurred_at(latest_event.occurred_at)

    freshness_seconds = max(0, int((datetime.now(timezone.utc) - occurred_at).total_seconds()))
    is_fresh = freshness_seconds <= FRESH_TELEMETRY_WINDOW_SECONDS
    snapshot = _select_display_snapshot(events, latest_event)
    status = _derive_status(snapshot, freshness_seconds=freshness_seconds, is_fresh=is_fresh)

    return BrokerTelemetryLatestResponse(
        telemetry=BrokerTelemetryLatestRead(
            id=latest_event.id,
            event_id=latest_event.event_id,
            event_type=latest_event.event_type,
            source=latest_event.source,
            platform=latest_event.platform,
            broker_adapter=latest_event.broker_adapter,
            observation_key=latest_event.observation_key,
            page_url=latest_event.page_url,
            page_title=latest_event.page_title,
            occurred_at=latest_event.occurred_at,
            received_at=latest_event.received_at,
            snapshot=snapshot,
            symbol=(snapshot.get("generic") or {}).get("current_symbol"),
            account_name=(snapshot.get("broker") or {}).get("current_account_name"),
            freshness_seconds=freshness_seconds,
            freshness_window_seconds=FRESH_TELEMETRY_WINDOW_SECONDS,
            is_fresh=is_fresh,
            status=status,
        )
    )
