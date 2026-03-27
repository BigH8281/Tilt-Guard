from collections.abc import Generator
from datetime import datetime, timedelta
from pathlib import Path
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models.trading_session import TradingSession
from app.models.user import User
from app.security import hash_password
from app.services.trade import create_close_trade, create_open_trade, get_position_size, upsert_observed_trade


@pytest.fixture()
def reconciliation_db() -> Generator[sessionmaker[Session], None, None]:
    temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp_db_path = Path(temp_db.name)
    temp_db.close()
    engine = create_engine(
        f"sqlite+pysqlite:///{temp_db_path}",
        connect_args={"check_same_thread": False},
    )
    testing_session_local = sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(engine)

    try:
        yield testing_session_local
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
        temp_db_path.unlink(missing_ok=True)


def seed_open_session(db: Session) -> TradingSession:
    user = User(email="reconciliation@example.com", hashed_password=hash_password("password123"))
    db.add(user)
    db.flush()

    session = TradingSession(
        user_id=user.id,
        status="open",
        session_name="London",
        symbol="XAUUSD",
        market_bias="bullish",
        htf_condition="trend",
        expected_open_type="continuation",
        confidence=7,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def test_manual_trade_merges_into_observed_fact_record(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        manual_event = create_open_trade(
            db=db,
            session=session,
            direction="buy",
            size=2,
            symbol="XAUUSD",
            note=None,
        )

        observed_event = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-1",
            event_type="OPEN",
            symbol="XAUUSD",
            direction="buy",
            size=3,
            event_time=datetime.utcnow() + timedelta(seconds=15),
            result_gbp=None,
            note=None,
        )

        assert observed_event.id == manual_event.id
        assert observed_event.source == "merged"
        assert observed_event.reconciliation_state == "matched"
        assert observed_event.size == 3
        assert observed_event.direction == "buy"
        assert observed_event.observed_episode_id == "episode-open-1"


def test_observed_trade_absorbs_manual_reflection_without_duplicate(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        create_open_trade(
            db=db,
            session=session,
            direction="sell",
            size=1,
            symbol="NAS100",
            note="Seed open to create an add scenario.",
        )
        observed_event = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-2",
            event_type="ADD",
            symbol="NAS100",
            direction="sell",
            size=1,
            event_time=datetime.utcnow(),
            result_gbp=None,
            note=None,
        )

        merged_event = create_open_trade(
            db=db,
            session=session,
            direction="sell",
            size=1,
            symbol="NAS100",
            note="Felt late but followed the signal.",
        )

        assert merged_event.id == observed_event.id
        assert merged_event.source == "merged"
        assert merged_event.reconciliation_state == "matched"
        assert merged_event.event_type == "ADD"
        assert merged_event.note == "Felt late but followed the signal."

        all_events = list(db.query(type(observed_event)).filter_by(session_id=session.id))
        assert len(all_events) == 2


def test_observed_close_merges_into_manual_close_without_duplicate(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        open_event = create_open_trade(
            db=db,
            session=session,
            direction="buy",
            size=1,
            symbol="XAUUSD",
            note=None,
        )

        manual_close = create_close_trade(
            db=db,
            session=session,
            size=1,
            result_gbp=75.0,
            symbol="XAUUSD",
            note="Took the first clean target.",
        )

        observed_close = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-close-1",
            event_type="CLOSE",
            symbol="XAUUSD",
            direction=None,
            size=1,
            event_time=manual_close.event_time + timedelta(seconds=20),
            result_gbp=75.0,
            note=None,
        )

        assert observed_close.id == manual_close.id
        assert observed_close.source == "merged"
        assert observed_close.reconciliation_state == "matched"
        assert observed_close.note == "Took the first clean target."

        all_events = list(db.query(type(observed_close)).filter_by(session_id=session.id))
        assert len(all_events) == 2


def test_distinct_same_symbol_open_events_remain_separate_when_position_stays_open(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        first_open = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-a",
            event_type="OPEN",
            symbol="XAUUSD",
            direction="buy",
            size=1,
            event_time=datetime.utcnow(),
            result_gbp=None,
            note=None,
        )

        second_open = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-b",
            event_type="OPEN",
            symbol="XAUUSD",
            direction="buy",
            size=1,
            event_time=first_open.event_time + timedelta(seconds=45),
            result_gbp=None,
            note=None,
        )

        assert second_open.id != first_open.id

        open_events = list(db.query(type(first_open)).filter_by(session_id=session.id, event_type="OPEN"))
        assert len(open_events) == 2


def test_fast_reentry_after_close_does_not_merge_into_previous_open(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        first_open = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-initial",
            event_type="OPEN",
            symbol="XAUUSD",
            direction="buy",
            size=1,
            event_time=datetime.utcnow(),
            result_gbp=None,
            note=None,
        )

        first_close = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-close-initial",
            event_type="CLOSE",
            symbol="XAUUSD",
            direction=None,
            size=1,
            event_time=first_open.event_time + timedelta(seconds=20),
            result_gbp=40.0,
            note=None,
        )

        second_open = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-reentry",
            event_type="OPEN",
            symbol="XAUUSD",
            direction="buy",
            size=1,
            event_time=first_close.event_time + timedelta(seconds=20),
            result_gbp=None,
            note=None,
        )

        assert second_open.id != first_open.id

        all_events = list(db.query(type(first_open)).filter_by(session_id=session.id))
        assert len(all_events) == 3


def test_observed_add_creates_separate_add_record_and_updates_position_size(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        first_open = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-open-seed",
            event_type="OPEN",
            symbol="XAUUSD",
            direction="buy",
            size=1,
            event_time=datetime.utcnow(),
            result_gbp=None,
            note=None,
        )

        added_trade = upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id="episode-add-1",
            event_type="ADD",
            symbol="XAUUSD",
            direction="buy",
            size=1,
            event_time=first_open.event_time + timedelta(seconds=20),
            result_gbp=None,
            note=None,
        )

        assert added_trade.id != first_open.id
        assert added_trade.event_type == "ADD"
        assert get_position_size(db, session.id) == 2


def test_manual_partial_close_creates_reduce_record(
    reconciliation_db: sessionmaker[Session],
) -> None:
    with reconciliation_db() as db:
        session = seed_open_session(db)
        first_open = create_open_trade(
            db=db,
            session=session,
            direction="buy",
            size=2,
            symbol="XAUUSD",
            note=None,
        )

        reduced_trade = create_close_trade(
            db=db,
            session=session,
            size=1,
            result_gbp=25.0,
            symbol="XAUUSD",
            note="Trimmed one into the first target.",
        )

        assert first_open.event_type == "OPEN"
        assert reduced_trade.event_type == "REDUCE"
        assert get_position_size(db, session.id) == 1
