import logging

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.trade_event import TradeEvent
from app.models.trading_session import TradingSession
from app.services.session import ensure_session_is_open


logger = logging.getLogger(__name__)


def get_position_size(db: Session, session_id: int) -> int:
    position_delta = case(
        (TradeEvent.event_type == "OPEN", TradeEvent.size),
        (TradeEvent.event_type == "CLOSE", -TradeEvent.size),
        else_=0,
    )
    statement = select(func.coalesce(func.sum(position_delta), 0)).where(TradeEvent.session_id == session_id)
    return int(db.scalar(statement) or 0)


def create_open_trade(
    db: Session,
    session: TradingSession,
    direction: str,
    size: int,
    note: str | None,
) -> TradeEvent:
    ensure_session_is_open(session)

    event = TradeEvent(
        session_id=session.id,
        event_type="OPEN",
        direction=direction,
        size=size,
        note=note,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def create_close_trade(
    db: Session,
    session: TradingSession,
    size: int,
    result_gbp: float,
    note: str | None,
) -> TradeEvent:
    ensure_session_is_open(session)

    current_open_size = get_position_size(db, session.id)
    logger.info(
        "close_trade_attempt session_id=%s requested_size=%s current_open_size=%s",
        session.id,
        size,
        current_open_size,
    )
    if current_open_size <= 0:
        logger.warning(
            "close_trade_rejected_no_open_position session_id=%s requested_size=%s",
            session.id,
            size,
        )
        raise ValueError("Cannot close a trade because no open position exists.")
    if size > current_open_size:
        logger.warning(
            "close_trade_rejected_size_exceeds_position session_id=%s requested_size=%s current_open_size=%s",
            session.id,
            size,
            current_open_size,
        )
        raise ValueError("Cannot close more than the current open size.")

    event = TradeEvent(
        session_id=session.id,
        event_type="CLOSE",
        size=size,
        result_gbp=result_gbp,
        note=note,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    logger.info(
        "close_trade_created session_id=%s trade_event_id=%s remaining_open_size=%s",
        session.id,
        event.id,
        current_open_size - size,
    )
    return event
