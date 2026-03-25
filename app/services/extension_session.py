from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.extension_session import ExtensionSession
from app.models.user import User
from app.schemas.extension_session import (
    ExtensionSessionRead,
    ExtensionSessionStatusResponse,
    ExtensionSessionUpsertRequest,
)
from app.services.broker_telemetry import record_extension_system_events

LIVE_HEARTBEAT_WINDOW_SECONDS = 45
STALE_HEARTBEAT_WINDOW_SECONDS = 150


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _freshness_seconds(last_heartbeat_at: datetime) -> int:
    return max(0, int((_utcnow() - last_heartbeat_at).total_seconds()))


def _derive_status(last_heartbeat_at: datetime) -> str:
    freshness_seconds = _freshness_seconds(last_heartbeat_at)
    if freshness_seconds <= LIVE_HEARTBEAT_WINDOW_SECONDS:
        return "live"
    if freshness_seconds <= STALE_HEARTBEAT_WINDOW_SECONDS:
        return "attention"
    return "offline"


def _to_read_model(session: ExtensionSession) -> ExtensionSessionRead:
    freshness_seconds = _freshness_seconds(session.last_heartbeat_at)
    return ExtensionSessionRead(
        id=session.id,
        session_key=session.session_key,
        extension_id=session.extension_id,
        extension_version=session.extension_version,
        platform=session.platform,
        extension_state=session.extension_state,
        monitoring_state=session.monitoring_state,
        tradingview_detected=session.tradingview_detected,
        broker_adapter=session.broker_adapter,
        broker_profile=session.broker_profile,
        adapter_confidence=session.adapter_confidence,
        adapter_reliability=session.adapter_reliability,
        warning_message=session.warning_message,
        current_tab_url=session.current_tab_url,
        current_tab_title=session.current_tab_title,
        status_payload=session.status_payload,
        connected_at=session.connected_at,
        last_heartbeat_at=session.last_heartbeat_at,
        disconnected_at=session.disconnected_at,
        freshness_seconds=freshness_seconds,
        freshness_window_seconds=LIVE_HEARTBEAT_WINDOW_SECONDS,
        status=_derive_status(session.last_heartbeat_at),
    )


def get_latest_extension_session(db: Session, user_id: int) -> ExtensionSession | None:
    statement = (
        select(ExtensionSession)
        .where(ExtensionSession.user_id == user_id)
        .order_by(desc(ExtensionSession.last_heartbeat_at), desc(ExtensionSession.id))
        .limit(1)
    )
    return db.scalar(statement)


def get_active_extension_session(db: Session, user_id: int, extension_id: str) -> ExtensionSession | None:
    statement = (
        select(ExtensionSession)
        .where(
            ExtensionSession.user_id == user_id,
            ExtensionSession.extension_id == extension_id,
            ExtensionSession.disconnected_at.is_(None),
        )
        .order_by(desc(ExtensionSession.last_heartbeat_at), desc(ExtensionSession.id))
        .limit(1)
    )
    return db.scalar(statement)


def upsert_extension_session(
    db: Session,
    user: User,
    payload: ExtensionSessionUpsertRequest,
) -> ExtensionSessionRead:
    session = get_active_extension_session(db, user.id, payload.extension_id)
    previous_state = None
    now = _utcnow()

    if session is None:
        session = ExtensionSession(
            user_id=user.id,
            session_key=str(uuid4()),
            extension_id=payload.extension_id,
            connected_at=now,
            last_heartbeat_at=now,
        )
        db.add(session)
    else:
        previous_state = {
            "extension_state": session.extension_state,
            "monitoring_state": session.monitoring_state,
            "tradingview_detected": session.tradingview_detected,
            "broker_adapter": session.broker_adapter,
            "broker_profile": session.broker_profile,
            "warning_message": session.warning_message,
            "disconnected_at": session.disconnected_at,
        }

    session.extension_version = payload.extension_version
    session.platform = payload.platform
    session.extension_state = payload.extension_state
    session.monitoring_state = payload.monitoring_state
    session.tradingview_detected = payload.tradingview_detected
    session.broker_adapter = payload.broker_adapter
    session.broker_profile = payload.broker_profile
    session.adapter_confidence = payload.adapter_confidence
    session.adapter_reliability = payload.adapter_reliability
    session.warning_message = payload.warning_message
    session.current_tab_url = payload.current_tab_url
    session.current_tab_title = payload.current_tab_title
    session.status_payload = payload.status_payload
    session.last_heartbeat_at = now
    session.disconnected_at = None

    db.flush()
    record_extension_system_events(
        db=db,
        user=user,
        session=session,
        payload=payload,
        previous_state=previous_state,
    )
    db.commit()
    db.refresh(session)
    return _to_read_model(session)


def disconnect_extension_session(db: Session, user: User, extension_id: str) -> ExtensionSessionRead | None:
    session = get_active_extension_session(db, user.id, extension_id)
    if session is None:
        return None

    previous_state = {
        "extension_state": session.extension_state,
        "monitoring_state": session.monitoring_state,
        "tradingview_detected": session.tradingview_detected,
        "broker_adapter": session.broker_adapter,
        "broker_profile": session.broker_profile,
        "warning_message": session.warning_message,
        "disconnected_at": session.disconnected_at,
    }
    session.extension_state = "signed_out"
    session.monitoring_state = "inactive"
    session.tradingview_detected = False
    session.warning_message = None
    session.last_heartbeat_at = _utcnow()
    session.disconnected_at = session.last_heartbeat_at

    db.flush()
    record_extension_system_events(
        db=db,
        user=user,
        session=session,
        payload=None,
        previous_state=previous_state,
        disconnected=True,
    )
    db.commit()
    db.refresh(session)
    return _to_read_model(session)


def get_extension_status(db: Session, user: User) -> ExtensionSessionStatusResponse:
    session = get_latest_extension_session(db, user.id)
    return ExtensionSessionStatusResponse(session=_to_read_model(session) if session else None)
