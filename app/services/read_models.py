from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journal_entry import JournalEntry
from app.models.screenshot import Screenshot
from app.models.trade_event import TradeEvent


def list_journal_entries_for_session(db: Session, session_id: int) -> list[JournalEntry]:
    statement = (
        select(JournalEntry)
        .where(JournalEntry.session_id == session_id)
        .order_by(JournalEntry.created_at.asc())
    )
    return list(db.scalars(statement).all())


def list_trade_events_for_session(db: Session, session_id: int) -> list[TradeEvent]:
    statement = (
        select(TradeEvent)
        .where(TradeEvent.session_id == session_id)
        .order_by(TradeEvent.event_time.asc(), TradeEvent.id.asc())
    )
    return list(db.scalars(statement).all())


def list_screenshots_for_session(db: Session, session_id: int) -> list[Screenshot]:
    statement = (
        select(Screenshot)
        .where(Screenshot.session_id == session_id)
        .order_by(Screenshot.uploaded_at.asc(), Screenshot.id.asc())
    )
    return list(db.scalars(statement).all())
