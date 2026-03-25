from collections.abc import Generator
from pathlib import Path
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models.user import User
from app.security import create_access_token, hash_password


@pytest.fixture()
def extension_test_context() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
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


def seed_user(testing_session_local: sessionmaker[Session]) -> str:
    with testing_session_local() as db:
        user = User(email="extension@example.com", hashed_password=hash_password("password123"))
        db.add(user)
        db.commit()
        db.refresh(user)
        return create_access_token(str(user.id))


def test_extension_session_connect_heartbeat_disconnect_lifecycle(
    extension_test_context: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = extension_test_context
    token = seed_user(testing_session_local)
    headers = {"Authorization": f"Bearer {token}"}

    connect_payload = {
        "extension_id": "test-extension-id",
        "extension_version": "0.3.0",
        "platform": "tradingview",
        "extension_state": "tradingview_detected",
        "monitoring_state": "inactive",
        "tradingview_detected": True,
        "broker_adapter": "tradingview_base",
        "broker_profile": None,
        "adapter_confidence": 0.55,
        "adapter_reliability": "medium",
        "warning_message": "Waiting for chart telemetry.",
        "current_tab_url": "https://www.tradingview.com/chart/abc123/",
        "current_tab_title": "Chart",
        "status_payload": {"symbol": "MNQ"},
    }
    connect_response = client.post("/extension-sessions/connect", headers=headers, json=connect_payload)
    assert connect_response.status_code == 200
    connected = connect_response.json()["session"]
    assert connected["extension_state"] == "tradingview_detected"
    assert connected["status"] == "live"
    assert connected["tradingview_detected"] is True
    assert connected["session_key"]

    heartbeat_payload = {
        **connect_payload,
        "extension_state": "monitoring_active",
        "monitoring_state": "active",
        "broker_adapter": "tradingview_fxcm",
        "broker_profile": "FXCM Live",
        "adapter_confidence": 0.95,
        "adapter_reliability": "high",
        "warning_message": None,
        "status_payload": {"symbol": "MNQ", "trading_panel_visible": True},
    }
    heartbeat_response = client.post("/extension-sessions/heartbeat", headers=headers, json=heartbeat_payload)
    assert heartbeat_response.status_code == 200
    heartbeat = heartbeat_response.json()["session"]
    assert heartbeat["extension_state"] == "monitoring_active"
    assert heartbeat["monitoring_state"] == "active"
    assert heartbeat["broker_adapter"] == "tradingview_fxcm"
    assert heartbeat["broker_profile"] == "FXCM Live"

    status_response = client.get("/extension-sessions/status", headers=headers)
    assert status_response.status_code == 200
    status_payload = status_response.json()["session"]
    assert status_payload["extension_state"] == "monitoring_active"
    assert status_payload["broker_profile"] == "FXCM Live"

    disconnect_response = client.post(
        "/extension-sessions/disconnect",
        headers=headers,
        json={"extension_id": "test-extension-id"},
    )
    assert disconnect_response.status_code == 200
    disconnected = disconnect_response.json()["session"]
    assert disconnected["extension_state"] == "signed_out"
    assert disconnected["disconnected_at"] is not None

    system_feed_response = client.get("/broker-telemetry/system-feed?limit=10", headers=headers)
    assert system_feed_response.status_code == 200
    event_types = [item["event_type"] for item in system_feed_response.json()["events"]]
    assert "extension_connected" in event_types
    assert "monitoring_activated" in event_types
    assert "extension_disconnected" in event_types
