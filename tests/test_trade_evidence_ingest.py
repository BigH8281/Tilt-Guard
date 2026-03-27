from collections.abc import Generator
from pathlib import Path
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models.trading_session import TradingSession
from app.models.user import User
from app.security import create_access_token, hash_password


def build_snapshot(symbol: str) -> dict:
    return {
        "generic": {
            "is_tradingview_chart": True,
            "trading_surface_visible": True,
            "trading_panel_visible": True,
            "current_symbol": symbol,
            "account_manager_entrypoint_visible": True,
            "broker_selector_visible": True,
            "order_entry_control_visible": True,
            "panel_open_control_visible": False,
            "panel_maximize_control_visible": False,
        },
        "broker": {
            "broker_connected": True,
            "broker_label": "FXCM Live",
            "current_account_name": "Demo 123",
            "fxcm_footer_cluster_visible": True,
            "anchor_summary": {},
        },
        "trade": {
            "ticket_visible": True,
            "order_visible": True,
            "submit_control_visible": True,
            "cancel_control_visible": False,
            "selected_side": "buy",
            "order_type": "market",
            "quantity": 1,
            "price": None,
            "position_size": None,
            "position_side": None,
            "visible_order_summary": "buy market 1",
        },
    }


@pytest.fixture()
def evidence_test_context() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
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


def seed_user_and_open_session(testing_session_local: sessionmaker[Session]) -> str:
    with testing_session_local() as db:
        user = User(email="evidence@example.com", hashed_password=hash_password("password123"))
        db.add(user)
        db.flush()
        session = TradingSession(
            user_id=user.id,
            status="open",
            session_name="London",
            symbol="NAS100",
            market_bias="bullish",
            htf_condition="trend",
            expected_open_type="continuation",
            confidence=7,
        )
        db.add(session)
        db.commit()
        return create_access_token(str(user.id))


def test_trade_evidence_ingest_links_to_extension_and_open_session(
    evidence_test_context: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = evidence_test_context
    token = seed_user_and_open_session(testing_session_local)
    headers = {"Authorization": f"Bearer {token}"}

    connect_payload = {
        "extension_id": "test-extension-id",
        "extension_version": "0.3.0",
        "platform": "tradingview",
        "extension_state": "monitoring_active",
        "monitoring_state": "active",
        "tradingview_detected": True,
        "broker_adapter": "tradingview_fxcm",
        "broker_profile": "FXCM Live",
        "adapter_confidence": 0.95,
        "adapter_reliability": "high",
        "warning_message": None,
        "current_tab_url": "https://www.tradingview.com/chart/abc123/",
        "current_tab_title": "NAS100 - TradingView",
        "status_payload": {"symbol": "NAS100"},
    }
    connect_response = client.post("/extension-sessions/connect", headers=headers, json=connect_payload)
    assert connect_response.status_code == 200
    session_key = connect_response.json()["session"]["session_key"]

    evidence_payload = {
        "events": [
            {
                "event_id": "11111111-1111-4111-8111-111111111111",
                "event_type": "trade_submit_clicked",
                "occurred_at": "2026-03-25T12:00:00Z",
                "source": "extension",
                "platform": "tradingview",
                "broker_adapter": "tradingview_fxcm",
                "observation_key": "tradingview_fxcm:7:https://www.tradingview.com/chart/abc123/",
                "page_url": "https://www.tradingview.com/chart/abc123/",
                "page_title": "NAS100 - TradingView",
                "tab_id": 7,
                "snapshot": build_snapshot("NAS100"),
                "details": {
                    "evidence_stage": "intent_observed",
                    "confidence": 0.82,
                    "symbol": "NAS100",
                    "broker_profile": "FXCM Live",
                    "side": "buy",
                    "order_type": "market",
                    "quantity": 1,
                    "price": None,
                    "raw_signal_summary": "submit control clicked: buy",
                },
            }
        ]
    }

    ingest_response = client.post("/broker-telemetry/ingest", headers=headers, json=evidence_payload)
    assert ingest_response.status_code == 202
    assert ingest_response.json()["accepted"] == 1

    evidence_response = client.get("/broker-telemetry/trade-evidence?limit=5", headers=headers)
    assert evidence_response.status_code == 200
    event = evidence_response.json()["events"][0]
    assert event["event_type"] == "trade_submit_clicked"
    assert event["symbol"] == "NAS100"
    assert event["side"] == "buy"
    assert event["extension_session_key"] == session_key
    assert event["trading_session_id"] is not None

    system_response = client.get("/broker-telemetry/system-feed?limit=20", headers=headers)
    assert system_response.status_code == 200
    assert "trade_submit_clicked" not in [item["event_type"] for item in system_response.json()["events"]]


def test_chart_action_evidence_is_stored_but_kept_out_of_system_feed(
    evidence_test_context: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = evidence_test_context
    token = seed_user_and_open_session(testing_session_local)
    headers = {"Authorization": f"Bearer {token}"}

    connect_payload = {
        "extension_id": "test-extension-id",
        "extension_version": "0.3.0",
        "platform": "tradingview",
        "extension_state": "monitoring_active",
        "monitoring_state": "active",
        "tradingview_detected": True,
        "broker_adapter": "tradingview_base",
        "broker_profile": "Paper Trading",
        "adapter_confidence": 0.84,
        "adapter_reliability": "medium",
        "warning_message": None,
        "current_tab_url": "https://www.tradingview.com/chart/abc123/",
        "current_tab_title": "NAS100 - TradingView",
        "status_payload": {"symbol": "NAS100"},
    }
    connect_response = client.post("/extension-sessions/connect", headers=headers, json=connect_payload)
    assert connect_response.status_code == 200

    evidence_payload = {
        "events": [
            {
                "event_id": "22222222-2222-4222-8222-222222222222",
                "event_type": "chart_trade_buy_clicked",
                "occurred_at": "2026-03-25T12:01:00Z",
                "source": "extension",
                "platform": "tradingview",
                "broker_adapter": "tradingview_base",
                "observation_key": "tradingview_base:7:https://www.tradingview.com/chart/abc123/",
                "page_url": "https://www.tradingview.com/chart/abc123/",
                "page_title": "NAS100 - TradingView",
                "tab_id": 7,
                "snapshot": build_snapshot("NAS100"),
                "details": {
                    "evidence_stage": "intent_observed",
                    "confidence": 0.8,
                    "symbol": "NAS100",
                    "broker_profile": "Paper Trading",
                    "side": "buy",
                    "order_type": "market",
                    "quantity": 1,
                    "price": None,
                    "raw_signal_summary": "chart buy control clicked",
                    "source_surface": "chart_inline",
                },
            }
        ]
    }

    ingest_response = client.post("/broker-telemetry/ingest", headers=headers, json=evidence_payload)
    assert ingest_response.status_code == 202
    assert ingest_response.json()["accepted"] == 1

    evidence_response = client.get("/broker-telemetry/trade-evidence?limit=5", headers=headers)
    assert evidence_response.status_code == 200
    event = evidence_response.json()["events"][0]
    assert event["event_type"] == "chart_trade_buy_clicked"
    assert event["details"]["source_surface"] == "chart_inline"
    assert event["trading_session_id"] is not None

    system_response = client.get("/broker-telemetry/system-feed?limit=20", headers=headers)
    assert system_response.status_code == 200
    assert "chart_trade_buy_clicked" not in [item["event_type"] for item in system_response.json()["events"]]


def test_confirmed_different_symbol_trade_still_links_to_live_open_session(
    evidence_test_context: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, testing_session_local = evidence_test_context
    token = seed_user_and_open_session(testing_session_local)
    headers = {"Authorization": f"Bearer {token}"}

    connect_payload = {
        "extension_id": "test-extension-id",
        "extension_version": "0.3.0",
        "platform": "tradingview",
        "extension_state": "monitoring_active",
        "monitoring_state": "active",
        "tradingview_detected": True,
        "broker_adapter": "tradingview_base",
        "broker_profile": "Paper Trading",
        "adapter_confidence": 0.84,
        "adapter_reliability": "medium",
        "warning_message": None,
        "current_tab_url": "https://www.tradingview.com/chart/abc123/",
        "current_tab_title": "XAUUSD - TradingView",
        "status_payload": {"symbol": "XAUUSD"},
    }
    connect_response = client.post("/extension-sessions/connect", headers=headers, json=connect_payload)
    assert connect_response.status_code == 200

    evidence_payload = {
        "events": [
            {
                "event_id": "33333333-3333-4333-8333-333333333333",
                "event_type": "trade_position_opened",
                "occurred_at": "2026-03-25T12:02:00Z",
                "source": "extension",
                "platform": "tradingview",
                "broker_adapter": "tradingview_base",
                "observation_key": "tradingview_base:7:https://www.tradingview.com/chart/abc123/",
                "page_url": "https://www.tradingview.com/chart/abc123/",
                "page_title": "XAUUSD - TradingView",
                "tab_id": 7,
                "snapshot": build_snapshot("XAUUSD"),
                "details": {
                    "evidence_stage": "execution_confirmed",
                    "confidence": 0.92,
                    "symbol": "XAUUSD",
                    "broker_profile": "Paper Trading",
                    "side": "buy",
                    "order_type": "market",
                    "quantity": 2,
                    "price": 2188.5,
                    "raw_signal_summary": "visible open position detected",
                    "source_surface": "position_table",
                },
            }
        ]
    }

    ingest_response = client.post("/broker-telemetry/ingest", headers=headers, json=evidence_payload)
    assert ingest_response.status_code == 202
    assert ingest_response.json()["accepted"] == 1

    evidence_response = client.get("/broker-telemetry/trade-evidence?limit=5", headers=headers)
    assert evidence_response.status_code == 200
    event = evidence_response.json()["events"][0]
    assert event["event_type"] == "trade_position_opened"
    assert event["symbol"] == "XAUUSD"
    assert event["trading_session_id"] is not None
    assert event["details"]["session_symbol"] == "NAS100"
    assert event["details"]["symbol_mismatch"] is True
