from sqlalchemy.orm import Session

from app.models.journal_entry import JournalEntry
from app.models.trading_session import TradingSession
from app.services.session import ensure_session_is_open


def create_journal_entry(db: Session, session: TradingSession, content: str) -> JournalEntry:
    ensure_session_is_open(session)

    entry = JournalEntry(
        session_id=session.id,
        content=content,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
