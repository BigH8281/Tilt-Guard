from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.broker_telemetry_event import BrokerTelemetryEvent
from app.models.extension_session import ExtensionSession
from app.models.user import User
from app.schemas.broker_telemetry import (
    BrokerTelemetryBatchIngestRequest,
    BrokerTelemetryBatchIngestResponse,
    BrokerTelemetryEventListResponse,
    BrokerTelemetryIngestResult,
    BrokerTelemetryLatestRead,
    BrokerTelemetryLatestResponse,
    BrokerTelemetrySystemEventListResponse,
    BrokerTelemetrySystemEventRead,
    TradeEvidenceListResponse,
    TradeEvidenceRead,
)
from app.services.session import get_open_session_for_user

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
SYSTEM_EVENT_TYPES = {
    "extension_connected",
    "extension_disconnected",
    "tradingview_detected",
    "adapter_unmatched",
    "broker_profile_matched",
    "monitoring_activated",
    "monitoring_stale",
    "monitoring_lost",
    "reconnect_succeeded",
}
OBSERVATION_EVENT_TYPES = {
    "tradingview_tab_detected",
    "trading_panel_visible",
    "broker_connected",
    "broker_disconnected",
    "broker_label_changed",
    "account_manager_control_visible",
    "order_entry_control_visible",
    "panel_open_control_visible",
    "panel_maximize_control_visible",
    "snapshot_refreshed",
    "observation_gap",
}
TRADE_EVIDENCE_EVENT_TYPES = {
    "trade_ticket_opened",
    "trade_side_selected",
    "trade_order_type_detected",
    "trade_quantity_detected",
    "trade_submit_clicked",
    "trade_order_visible",
    "trade_position_opened",
    "trade_position_changed",
    "trade_position_closed",
    "trade_order_cancelled",
    "trade_execution_unverified",
    "chart_trade_control_visible",
    "chart_trade_buy_clicked",
    "chart_trade_sell_clicked",
    "chart_long_tool_selected",
    "chart_short_tool_selected",
    "chart_position_tool_placed",
    "chart_position_tool_modified",
    "chart_position_tool_removed",
    "chart_trade_execution_unverified",
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
            "trade": {
                "ticket_visible": snapshot.get("trade", {}).get("ticket_visible", False),
                "order_visible": snapshot.get("trade", {}).get("order_visible", False),
                "submit_control_visible": snapshot.get("trade", {}).get("submit_control_visible", False),
                "cancel_control_visible": snapshot.get("trade", {}).get("cancel_control_visible", False),
                "chart_trade_controls_visible": snapshot.get("trade", {}).get("chart_trade_controls_visible", False),
                "chart_buy_control_visible": snapshot.get("trade", {}).get("chart_buy_control_visible", False),
                "chart_sell_control_visible": snapshot.get("trade", {}).get("chart_sell_control_visible", False),
                "selected_side": snapshot.get("trade", {}).get("selected_side"),
                "order_type": snapshot.get("trade", {}).get("order_type"),
                "quantity": snapshot.get("trade", {}).get("quantity"),
                "price": snapshot.get("trade", {}).get("price"),
                "position_size": snapshot.get("trade", {}).get("position_size"),
                "position_side": snapshot.get("trade", {}).get("position_side"),
                "visible_order_summary": snapshot.get("trade", {}).get("visible_order_summary"),
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
        "trade": {
            "ticket_visible": snapshot.get("ticket_visible", False),
            "order_visible": snapshot.get("order_visible", False),
            "submit_control_visible": snapshot.get("submit_control_visible", False),
            "cancel_control_visible": snapshot.get("cancel_control_visible", False),
            "chart_trade_controls_visible": snapshot.get("chart_trade_controls_visible", False),
            "chart_buy_control_visible": snapshot.get("chart_buy_control_visible", False),
            "chart_sell_control_visible": snapshot.get("chart_sell_control_visible", False),
            "selected_side": snapshot.get("selected_side"),
            "order_type": snapshot.get("order_type"),
            "quantity": snapshot.get("quantity"),
            "price": snapshot.get("price"),
            "position_size": snapshot.get("position_size"),
            "position_side": snapshot.get("position_side"),
            "visible_order_summary": snapshot.get("visible_order_summary"),
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


def _record_internal_event(
    db: Session,
    *,
    user: User,
    event_type: str,
    broker_adapter: str,
    page_url: str,
    page_title: str,
    snapshot: dict,
    details: dict | None = None,
) -> None:
    latest_extension_session = _get_latest_extension_session_for_user(db, user.id)
    db.add(
        BrokerTelemetryEvent(
            user_id=user.id,
            event_id=str(uuid4()),
            event_type=event_type,
            source="extension",
            platform="tradingview",
            broker_adapter=broker_adapter,
            observation_key=f"extension-session:{broker_adapter}:{page_url}",
            extension_session_key=latest_extension_session.session_key if latest_extension_session else None,
            page_url=page_url,
            page_title=page_title,
            occurred_at=datetime.utcnow(),
            snapshot=snapshot,
            details=details or {},
        )
    )


def _build_extension_snapshot(session: ExtensionSession) -> dict:
    payload = session.status_payload or {}
    return {
        "generic": {
            "is_tradingview_chart": session.tradingview_detected,
            "trading_surface_visible": session.tradingview_detected,
            "trading_panel_visible": payload.get("trading_panel_visible", False),
            "current_symbol": payload.get("symbol"),
            "account_manager_entrypoint_visible": payload.get("account_manager_entrypoint_visible", False),
            "broker_selector_visible": payload.get("broker_selector_visible", False),
            "order_entry_control_visible": payload.get("order_entry_control_visible", False),
            "panel_open_control_visible": payload.get("panel_open_control_visible", False),
            "panel_maximize_control_visible": payload.get("panel_maximize_control_visible", False),
        },
        "broker": {
            "broker_connected": session.broker_adapter not in {None, "", "tradingview_base"},
            "broker_label": session.broker_profile,
            "current_account_name": payload.get("account_name"),
            "fxcm_footer_cluster_visible": payload.get("fxcm_footer_cluster_visible", False),
            "anchor_summary": payload.get("anchor_summary") or {},
        },
        "trade": payload.get("trade") or {},
    }


def _link_open_session(db: Session, user: User, event_symbol: str | None) -> int | None:
    open_session = get_open_session_for_user(db, user.id)
    if open_session is None:
        return None

    return open_session.id


def _build_trade_evidence_details(
    db: Session,
    *,
    user: User,
    details: dict | None,
    event_symbol: str | None,
) -> tuple[dict, str | None, int | None]:
    latest_extension_session = _get_latest_extension_session_for_user(db, user.id)
    extension_session_key = latest_extension_session.session_key if latest_extension_session else None
    open_session = get_open_session_for_user(db, user.id)
    trading_session_id = _link_open_session(db, user, event_symbol)
    session_symbol = open_session.symbol if open_session else None
    symbol_mismatch = bool(session_symbol and event_symbol and session_symbol.upper() != event_symbol.upper())
    next_details = {
        **(details or {}),
        "extension_session_key": extension_session_key,
        "trading_session_id": trading_session_id,
        "session_symbol": session_symbol,
        "symbol_mismatch": symbol_mismatch,
    }
    return next_details, extension_session_key, trading_session_id


def _get_latest_extension_session_for_user(db: Session, user_id: int) -> ExtensionSession | None:
    statement = (
        select(ExtensionSession)
        .where(ExtensionSession.user_id == user_id)
        .order_by(desc(ExtensionSession.last_heartbeat_at), desc(ExtensionSession.id))
        .limit(1)
    )
    return db.scalar(statement)


def record_extension_system_events(
    db: Session,
    *,
    user: User,
    session: ExtensionSession,
    payload,
    previous_state: dict | None,
    disconnected: bool = False,
) -> None:
    snapshot = _build_extension_snapshot(session)
    page_url = session.current_tab_url or "extension://status"
    page_title = session.current_tab_title or "Tilt Guard Extension"
    broker_adapter = session.broker_adapter or "tradingview_base"

    if previous_state is None:
        _record_internal_event(
            db,
            user=user,
            event_type="extension_connected",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
            details={"extension_state": session.extension_state},
        )
    elif disconnected:
        _record_internal_event(
            db,
            user=user,
            event_type="extension_disconnected",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
            details={"previous_monitoring_state": previous_state.get("monitoring_state")},
        )
        return

    if not previous_state:
        previous_state = {}

    if not previous_state.get("tradingview_detected") and session.tradingview_detected:
        _record_internal_event(
            db,
            user=user,
            event_type="tradingview_detected",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
        )

    previous_adapter = previous_state.get("broker_adapter")
    if session.broker_adapter == "tradingview_base" and previous_adapter != "tradingview_base":
        _record_internal_event(
            db,
            user=user,
            event_type="adapter_unmatched",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
            details={"warning_message": session.warning_message},
        )

    if session.broker_adapter not in {None, "", "tradingview_base"} and previous_adapter != session.broker_adapter:
        _record_internal_event(
            db,
            user=user,
            event_type="broker_profile_matched",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
            details={
                "broker_profile": session.broker_profile,
                "adapter_confidence": session.adapter_confidence,
                "adapter_reliability": session.adapter_reliability,
            },
        )

    previous_monitoring_state = previous_state.get("monitoring_state")
    if session.monitoring_state == "active" and previous_monitoring_state != "active":
        event_type = "reconnect_succeeded" if previous_monitoring_state == "stale" else "monitoring_activated"
        _record_internal_event(
            db,
            user=user,
            event_type=event_type,
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
        )

    if session.monitoring_state == "stale" and previous_monitoring_state != "stale":
        _record_internal_event(
            db,
            user=user,
            event_type="monitoring_stale",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
            details={"warning_message": session.warning_message},
        )

    if previous_monitoring_state == "active" and session.monitoring_state in {"inactive", "error"}:
        _record_internal_event(
            db,
            user=user,
            event_type="monitoring_lost",
            broker_adapter=broker_adapter,
            page_url=page_url,
            page_title=page_title,
            snapshot=snapshot,
            details={"warning_message": session.warning_message},
        )


def _system_event_message(event: BrokerTelemetryEvent) -> tuple[str, str]:
    snapshot = _normalize_snapshot(dict(event.snapshot))
    broker = snapshot.get("broker") or {}
    generic = snapshot.get("generic") or {}
    broker_profile = broker.get("broker_label") or ((event.details or {}).get("broker_profile"))
    symbol = generic.get("current_symbol")

    messages = {
        "extension_connected": ("info", "Extension connected to Tilt-Guard."),
        "extension_disconnected": ("warning", "Extension disconnected from Tilt-Guard."),
        "tradingview_detected": ("info", "TradingView chart session detected."),
        "adapter_unmatched": ("warning", "TradingView detected, but broker profile is still unknown."),
        "broker_profile_matched": ("info", f"Broker profile matched: {broker_profile or event.broker_adapter}."),
        "monitoring_activated": ("info", "Live monitoring activated."),
        "monitoring_stale": ("warning", "Telemetry became stale. Reconnect in progress."),
        "monitoring_lost": ("warning", "Monitoring lost or degraded."),
        "reconnect_succeeded": ("info", "Monitoring reconnected successfully."),
        "tradingview_tab_detected": ("info", "TradingView tab observed by the extension."),
        "trading_panel_visible": ("info", "TradingView trading panel became visible."),
        "broker_connected": ("info", f"Broker connection observed: {broker_profile or 'connected'}"),
        "broker_disconnected": ("warning", "Broker connection no longer visible on TradingView."),
        "broker_label_changed": ("info", f"Broker label updated to {broker_profile or 'a new profile'}."),
        "account_manager_control_visible": ("info", "TradingView account manager control detected."),
        "order_entry_control_visible": ("info", f"Trade entry surface visible{f' for {symbol}' if symbol else ''}."),
        "panel_open_control_visible": ("info", "TradingView panel open control detected."),
        "panel_maximize_control_visible": ("info", "TradingView panel maximize control detected."),
        "snapshot_refreshed": ("info", f"TradingView snapshot refreshed{f' for {symbol}' if symbol else ''}."),
        "observation_gap": ("warning", "Telemetry observation gap detected."),
    }
    return messages.get(event.event_type, ("info", event.event_type.replace("_", " ").title()))


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

        snapshot = event.snapshot.model_dump(mode="json")
        event_symbol = ((snapshot.get("generic") or {}).get("current_symbol")) or ((event.details or {}).get("symbol"))
        linked_details, extension_session_key, trading_session_id = _build_trade_evidence_details(
            db,
            user=user,
            details=event.details,
            event_symbol=event_symbol,
        )

        stored_event = BrokerTelemetryEvent(
            user_id=user.id,
            event_id=event.event_id,
            event_type=event.event_type,
            source=event.source,
            platform=event.platform,
            broker_adapter=event.broker_adapter,
            observation_key=event.observation_key,
            extension_session_key=extension_session_key,
            trading_session_id=trading_session_id,
            page_url=event.page_url,
            page_title=event.page_title,
            occurred_at=event.occurred_at,
            snapshot=snapshot,
            details={
                **linked_details,
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
        .where(BrokerTelemetryEvent.event_type.in_(OBSERVATION_EVENT_TYPES))
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


def list_broker_system_events(
    db: Session,
    user: User,
    *,
    limit: int,
) -> BrokerTelemetrySystemEventListResponse:
    statement = (
        select(BrokerTelemetryEvent)
        .where(BrokerTelemetryEvent.user_id == user.id)
        .where(BrokerTelemetryEvent.event_type.not_in(TRADE_EVIDENCE_EVENT_TYPES))
        .order_by(desc(BrokerTelemetryEvent.occurred_at), desc(BrokerTelemetryEvent.id))
        .limit(limit)
    )
    events = list(db.scalars(statement))
    mapped_events: list[BrokerTelemetrySystemEventRead] = []
    for event in events:
        snapshot = _normalize_snapshot(dict(event.snapshot))
        level, message = _system_event_message(event)
        mapped_events.append(
            BrokerTelemetrySystemEventRead(
                id=event.id,
                event_id=event.event_id,
                event_type=event.event_type,
                occurred_at=event.occurred_at,
                level=level,
                message=message,
                broker_adapter=event.broker_adapter,
                broker_profile=(snapshot.get("broker") or {}).get("broker_label"),
                symbol=(snapshot.get("generic") or {}).get("current_symbol"),
                details=event.details,
            )
        )
    return BrokerTelemetrySystemEventListResponse(events=mapped_events)


def list_trade_evidence_events(
    db: Session,
    user: User,
    *,
    limit: int,
    trading_session_id: int | None = None,
    broker_adapter: str | None = None,
) -> TradeEvidenceListResponse:
    statement = (
        select(BrokerTelemetryEvent)
        .where(BrokerTelemetryEvent.user_id == user.id)
        .where(BrokerTelemetryEvent.event_type.in_(TRADE_EVIDENCE_EVENT_TYPES))
        .order_by(desc(BrokerTelemetryEvent.occurred_at), desc(BrokerTelemetryEvent.id))
        .limit(limit)
    )

    if trading_session_id is not None:
        statement = statement.where(BrokerTelemetryEvent.trading_session_id == trading_session_id)

    if broker_adapter:
        statement = statement.where(BrokerTelemetryEvent.broker_adapter == broker_adapter)

    mapped_events: list[TradeEvidenceRead] = []
    for event in db.scalars(statement):
        details = event.details or {}
        snapshot = _normalize_snapshot(dict(event.snapshot))
        broker = snapshot.get("broker") or {}
        generic = snapshot.get("generic") or {}
        mapped_events.append(
            TradeEvidenceRead(
                id=event.id,
                event_id=event.event_id,
                event_type=event.event_type,
                occurred_at=event.occurred_at,
                broker_adapter=event.broker_adapter,
                broker_profile=details.get("broker_profile") or broker.get("broker_label"),
                symbol=details.get("symbol") or generic.get("current_symbol"),
                side=details.get("side"),
                order_type=details.get("order_type"),
                quantity=details.get("quantity"),
                price=details.get("price"),
                confidence=float(details.get("confidence") or 0),
                evidence_stage=details.get("evidence_stage") or "intent_observed",
                raw_signal_summary=details.get("raw_signal_summary") or event.event_type.replace("_", " "),
                extension_session_key=event.extension_session_key or details.get("extension_session_key"),
                trading_session_id=event.trading_session_id or details.get("trading_session_id"),
                page_url=event.page_url,
                page_title=event.page_title,
                details=details,
            )
        )

    return TradeEvidenceListResponse(events=mapped_events)
