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
def test_context() -> Generator[tuple[TestClient, str], None, None]:
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

    with testing_session_local() as db:
        user = User(
            email="briefing@example.com",
            hashed_password=hash_password("password123"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_access_token(str(user.id))

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, token

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
    temp_db_path.unlink(missing_ok=True)


def test_pre_session_briefing_route_requires_authentication(
    test_context: tuple[TestClient, str],
) -> None:
    client, _ = test_context

    response = client.post("/pre-session-briefing/live", json={})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or missing authentication credentials."


def test_pre_session_briefing_live_returns_briefing(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    def fake_generate(_: dict) -> dict:
        return {
            "service": {"name": "pre-session-briefing", "version": "0.2.0", "api_version": "v1"},
            "request": {"market": "us-index-futures", "include_charts": True},
            "generated_at": "2026-04-01T08:00:00+00:00",
            "briefing": {
                "session_bias": "bullish",
                "directional_bias": "bullish",
                "confidence": "medium",
                "market_regime": "open-drive discovery",
                "trade_posture": "Buy pullbacks, not panic spikes.",
                "narrative": "Macro and news are supportive.",
                "tilt_guard_advice": ["Stay selective."],
                "top_drivers": ["NQ futures are firm."],
                "event_windows": ["ISM 15:00 BST / 10:00 ET"],
            },
            "charts": {
                "NQ": [
                    {
                        "timeframe": "4H",
                        "title": "4H structure",
                        "image_base64": "ZmFrZQ==",
                        "levels": [{"label": "R1", "price": 21950}],
                    }
                ]
            },
        }

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        fake_generate,
    )

    response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"]["version"] == "0.2.0"
    assert payload["briefing"]["session_bias"] == "bullish"
    assert payload["storage"]["scope"] == "current-user-briefing"
    assert payload["storage"]["charts_persisted"] is False
    assert payload["charts"]["NQ"][0]["title"] == "4H structure"


def test_pre_session_briefing_current_returns_404_when_missing(
    test_context: tuple[TestClient, str],
) -> None:
    client, token = test_context

    response = client.get(
        "/pre-session-briefing/current",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "No saved briefing found."


def test_pre_session_briefing_persists_latest_successful_result(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    def fake_generate(_: dict) -> dict:
        return {
            "service": {"name": "pre-session-briefing", "version": "0.2.0", "api_version": "v1"},
            "request": {"market": "us-index-futures", "include_charts": True},
            "generated_at": "2026-04-01T08:00:00+00:00",
            "briefing": {
                "session_bias": "bullish",
                "directional_bias": "bullish",
                "confidence": "medium",
                "market_regime": "open-drive discovery",
                "trade_posture": "Buy pullbacks, not panic spikes.",
                "narrative": "Macro and news are supportive.",
                "tilt_guard_advice": ["Stay selective."],
                "top_drivers": ["NQ futures are firm."],
                "event_windows": ["ISM 15:00 BST / 10:00 ET"],
            },
            "charts": {
                "NQ": [
                    {
                        "timeframe": "4H",
                        "title": "4H structure",
                        "image_base64": "ZmFrZQ==",
                        "levels": [{"label": "R1", "price": 21950}],
                    }
                ]
            },
        }

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        fake_generate,
    )

    create_response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )

    assert create_response.status_code == 200

    current_response = client.get(
        "/pre-session-briefing/current",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert current_response.status_code == 200
    assert current_response.json()["briefing"]["trade_posture"] == "Buy pullbacks, not panic spikes."
    assert current_response.json()["storage"]["charts_persisted"] is False
    assert current_response.json()["charts"] is None


def test_pre_session_briefing_regenerate_replaces_saved_result(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    responses = iter(
        [
            {
                "service": {"name": "pre-session-briefing", "version": "0.2.0", "api_version": "v1"},
                "request": {"market": "us-index-futures", "include_charts": False},
                "generated_at": "2026-04-01T08:00:00+00:00",
                "briefing": {
                    "session_bias": "bullish",
                    "directional_bias": "bullish",
                    "confidence": "medium",
                    "market_regime": "open-drive discovery",
                    "trade_posture": "Buy pullbacks.",
                    "narrative": "Initial narrative.",
                    "tilt_guard_advice": ["Stay selective."],
                    "top_drivers": ["NQ futures are firm."],
                    "event_windows": ["ISM 15:00 BST / 10:00 ET"],
                },
            },
            {
                "service": {"name": "pre-session-briefing", "version": "0.2.0", "api_version": "v1"},
                "request": {"market": "us-index-futures", "include_charts": False},
                "generated_at": "2026-04-01T09:15:00+00:00",
                "briefing": {
                    "session_bias": "bearish",
                    "directional_bias": "bearish",
                    "confidence": "high",
                    "market_regime": "trend down",
                    "trade_posture": "Sell failed pops.",
                    "narrative": "Updated narrative.",
                    "tilt_guard_advice": ["Stay patient."],
                    "top_drivers": ["Rates are rising."],
                    "event_windows": ["Powell 18:30 BST / 13:30 ET"],
                },
            },
        ]
    )

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        lambda _: next(responses),
    )

    first_response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )
    second_response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["briefing"]["session_bias"] == "bearish"

    current_response = client.get(
        "/pre-session-briefing/current",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert current_response.status_code == 200
    assert current_response.json()["briefing"]["narrative"] == "Updated narrative."
    assert current_response.json()["generated_at"] == "2026-04-01T09:15:00+00:00"


def test_pre_session_briefing_failed_refresh_keeps_previous_saved_result(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    def success(_: dict) -> dict:
        return {
            "service": {"name": "pre-session-briefing", "version": "0.2.0", "api_version": "v1"},
            "request": {"market": "us-index-futures", "include_charts": False},
            "generated_at": "2026-04-01T08:00:00+00:00",
            "briefing": {
                "session_bias": "mixed",
                "directional_bias": "mixed",
                "confidence": "low",
                "market_regime": "headline-driven",
                "trade_posture": "Wait for confirmation.",
                "narrative": "Saved narrative.",
                "tilt_guard_advice": ["Trade smaller."],
                "top_drivers": ["Headlines are noisy."],
                "event_windows": ["No immediate event windows."],
            },
        }

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        success,
    )

    first_response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )

    assert first_response.status_code == 200

    def fail(_: dict) -> dict:
        from presession_briefing.errors import LiveDataError

        raise LiveDataError("quotes unavailable")

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        fail,
    )

    failed_response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )

    assert failed_response.status_code == 503

    current_response = client.get(
        "/pre-session-briefing/current",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert current_response.status_code == 200
    assert current_response.json()["briefing"]["narrative"] == "Saved narrative."


def test_pre_session_briefing_live_rejects_invalid_timezone(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    def fail_if_called(_: dict) -> dict:
        raise AssertionError("service should not be called for invalid input")

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        fail_if_called,
    )

    response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Mars/Olympus"},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("Invalid local_timezone" in item["msg"] for item in detail)


def test_pre_session_briefing_live_handles_upstream_failure(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    def raise_live_failure(_: dict) -> dict:
        from presession_briefing.errors import LiveDataError

        raise LiveDataError("quotes unavailable")

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.generate_tg_pre_session_briefing",
        raise_live_failure,
    )

    response = client.post(
        "/pre-session-briefing/live",
        headers={"Authorization": f"Bearer {token}"},
        json={"local_timezone": "Europe/London"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "quotes unavailable"


def test_pre_session_briefing_capabilities_returns_supported_contract(
    test_context: tuple[TestClient, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, token = test_context

    monkeypatch.setattr(
        "app.routers.pre_session_briefing.get_pre_session_briefing_capabilities",
        lambda: {
            "service": {"name": "pre-session-briefing", "version": "0.2.0", "api_version": "v1"},
            "markets": [{"id": "us-index-futures", "label": "US index futures"}],
            "options": {"include_snapshot": True, "include_social": True, "include_charts": True},
            "charts": {"symbols": ["NQ"], "timeframes": ["1H"]},
            "response_fields": ["service", "request", "briefing"],
        },
    )

    response = client.get(
        "/pre-session-briefing/capabilities",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["service"]["name"] == "pre-session-briefing"
