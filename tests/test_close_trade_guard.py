from collections.abc import Generator
from pathlib import Path
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models.journal_entry import JournalEntry
from app.models.screenshot import Screenshot
from app.models.trade_event import TradeEvent
from app.models.trading_session import TradingSession
from app.models.user import User
from app.security import create_access_token, hash_password


@pytest.fixture()
def test_context() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
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

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, testing_session_local

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
    temp_db_path.unlink(missing_ok=True)


def seed_open_session(testing_session_local: sessionmaker[Session]) -> tuple[int, str]:
    with testing_session_local() as db:
        user = User(
            email="close-guard@example.com",
            hashed_password=hash_password("password123"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        session = TradingSession(
            user_id=user.id,
            status="open",
            session_name="Close Guard",
            symbol="MNQ",
            market_bias="bullish",
            htf_condition="trend day",
            expected_open_type="continuation",
            confidence=7,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        return session.id, create_access_token(str(user.id))


def test_close_trade_without_open_position_is_rejected_without_mutation(
    test_context: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = test_context
    session_id, token = seed_open_session(testing_session_local)

    response = client.post(
        f"/sessions/{session_id}/trade/close",
        headers={"Authorization": f"Bearer {token}"},
        json={"size": 1, "result_gbp": -25.0, "note": "forced close"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot close a trade because no open position exists."

    with testing_session_local() as db:
        session = db.get(TradingSession, session_id)
        assert session is not None
        assert session.status == "open"
        assert len(session.trade_events) == 0
        assert db.scalar(select(func.count()).select_from(JournalEntry)) == 0


def test_end_session_allows_flat_position_after_reduce_events(
    test_context: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = test_context
    session_id, token = seed_open_session(testing_session_local)

    with testing_session_local() as db:
        db.add_all(
            [
                TradeEvent(
                    session_id=session_id,
                    event_type="OPEN",
                    symbol="MNQ",
                    direction="short",
                    size=2,
                    note="entry",
                ),
                TradeEvent(
                    session_id=session_id,
                    event_type="REDUCE",
                    symbol="MNQ",
                    direction=None,
                    size=1,
                    result_gbp=125.0,
                    note="partial",
                ),
                TradeEvent(
                    session_id=session_id,
                    event_type="CLOSE",
                    symbol="MNQ",
                    direction=None,
                    size=1,
                    result_gbp=80.0,
                    note="final close",
                ),
                Screenshot(
                    session_id=session_id,
                    screenshot_type="post",
                    file_path="screenshots/test-post.png",
                ),
            ]
        )
        db.commit()

    response = client.post(
        f"/sessions/{session_id}/end",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "end_traded_my_time": True,
            "end_traded_my_conditions": True,
            "end_respected_my_exit": True,
            "reason_time_no": "",
            "reason_conditions_no": "",
            "reason_exit_no": "",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "closed"
    assert response.json()["closed_at"] is not None

    with testing_session_local() as db:
        session = db.get(TradingSession, session_id)
        assert session is not None
        assert session.status == "closed"
        assert session.closed_at is not None
