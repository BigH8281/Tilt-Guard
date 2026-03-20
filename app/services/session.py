from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.screenshot import Screenshot
from app.models.trade_event import TradeEvent
from app.models.trading_session import TradingSession
from app.models.user import User
from app.schemas.trading_session import (
    TradingSessionCreateRequest,
    TradingSessionEndRequest,
    TradingSessionSetupRequest,
)


SETUP_PENDING_VALUE = "pending"


def get_open_session_for_user(db: Session, user_id: int) -> TradingSession | None:
    statement = (
        select(TradingSession)
        .where(TradingSession.user_id == user_id, TradingSession.status == "open")
        .order_by(TradingSession.started_at.desc())
    )
    return db.scalars(statement).first()


def create_session(db: Session, user: User, payload: TradingSessionCreateRequest) -> TradingSession:
    session = TradingSession(
        user_id=user.id,
        status="open",
        session_name=payload.session_name.strip(),
        symbol=payload.symbol.strip().upper(),
        market_bias=SETUP_PENDING_VALUE,
        htf_condition=SETUP_PENDING_VALUE,
        expected_open_type=SETUP_PENDING_VALUE,
        confidence=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_sessions_for_user(db: Session, user_id: int) -> list[TradingSession]:
    statement = (
        select(TradingSession)
        .where(TradingSession.user_id == user_id)
        .order_by(TradingSession.started_at.desc())
    )
    return list(db.scalars(statement).all())


def get_session_for_user(db: Session, user_id: int, session_id: int) -> TradingSession | None:
    statement = select(TradingSession).where(
        TradingSession.id == session_id,
        TradingSession.user_id == user_id,
    )
    return db.scalar(statement)


def ensure_session_is_open(session: TradingSession) -> None:
    if session.status != "open":
        raise ValueError("Session is already closed.")


def update_session_setup(
    db: Session,
    session: TradingSession,
    payload: TradingSessionSetupRequest,
) -> TradingSession:
    ensure_session_is_open(session)

    session.market_bias = payload.market_bias.strip()
    session.htf_condition = payload.htf_condition.strip()
    session.expected_open_type = payload.expected_open_type.strip()
    session.confidence = payload.confidence

    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def session_has_screenshot_type(db: Session, session_id: int, screenshot_type: str) -> bool:
    statement = select(Screenshot.id).where(
        Screenshot.session_id == session_id,
        Screenshot.screenshot_type == screenshot_type,
    )
    return db.scalar(statement) is not None


def get_session_position_size(db: Session, session_id: int) -> int:
    position_delta = case(
        (TradeEvent.event_type == "OPEN", TradeEvent.size),
        (TradeEvent.event_type == "CLOSE", -TradeEvent.size),
        else_=0,
    )
    statement = select(func.coalesce(func.sum(position_delta), 0)).where(TradeEvent.session_id == session_id)
    return int(db.scalar(statement) or 0)


def close_session(db: Session, session: TradingSession, payload: TradingSessionEndRequest) -> TradingSession:
    ensure_session_is_open(session)

    if get_session_position_size(db, session.id) > 0:
        raise ValueError("Cannot close session while an open position still exists.")

    if not session_has_screenshot_type(db, session.id, "post"):
        raise ValueError("A post-session screenshot is required before closing the session.")

    session.status = "closed"
    session.closed_at = datetime.utcnow()
    session.end_traded_my_time = payload.end_traded_my_time
    session.end_traded_my_conditions = payload.end_traded_my_conditions
    session.end_respected_my_exit = payload.end_respected_my_exit
    session.reason_time_no = payload.reason_time_no.strip() if payload.reason_time_no else None
    session.reason_conditions_no = (
        payload.reason_conditions_no.strip() if payload.reason_conditions_no else None
    )
    session.reason_exit_no = payload.reason_exit_no.strip() if payload.reason_exit_no else None

    db.add(session)
    db.commit()
    db.refresh(session)
    return session
