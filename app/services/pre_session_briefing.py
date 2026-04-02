from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.current_pre_session_briefing import CurrentPreSessionBriefing
from presession_briefing.service import generate_live_response, service_capabilities


def get_pre_session_briefing_capabilities() -> dict[str, Any]:
    return service_capabilities()


def generate_tg_pre_session_briefing(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return generate_live_response(payload)


def _storage_metadata(record: CurrentPreSessionBriefing) -> dict[str, str | bool]:
    return {
        "scope": "current-user-briefing",
        "saved_at": record.updated_at.isoformat(),
        "charts_persisted": False,
    }


def _serialize_current_briefing(record: CurrentPreSessionBriefing) -> dict[str, Any]:
    payload = deepcopy(record.payload)
    payload["storage"] = _storage_metadata(record)
    return payload


def _build_persisted_briefing_payload(payload: dict[str, Any]) -> dict[str, Any]:
    persisted_payload = deepcopy(payload)
    persisted_payload.pop("charts", None)
    return persisted_payload


def get_current_tg_pre_session_briefing(db: Session, user_id: int) -> dict[str, Any] | None:
    record = db.scalar(
        select(CurrentPreSessionBriefing).where(CurrentPreSessionBriefing.user_id == user_id)
    )
    if record is None:
        return None
    return _serialize_current_briefing(record)


def save_current_tg_pre_session_briefing(
    db: Session,
    user_id: int,
    payload: dict[str, Any],
) -> dict[str, str | bool]:
    record = db.scalar(
        select(CurrentPreSessionBriefing).where(CurrentPreSessionBriefing.user_id == user_id)
    )
    persisted_payload = _build_persisted_briefing_payload(payload)
    if record is None:
        record = CurrentPreSessionBriefing(user_id=user_id, payload=persisted_payload)
        db.add(record)
    else:
        record.payload = persisted_payload

    db.commit()
    db.refresh(record)
    return _storage_metadata(record)
