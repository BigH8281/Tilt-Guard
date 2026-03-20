from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.trade_event import TradeEvent
from app.models.trading_session import TradingSession
from app.services.session import ensure_session_is_open


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
    if size > current_open_size:
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
    return event
