from fastapi.testclient import TestClient

from app.main import app


def test_extension_connect_page_serves_login_flow() -> None:
    with TestClient(app) as client:
        response = client.get("/extension/connect?extensionId=test-extension&mode=HOSTED")

    assert response.status_code == 200
    assert "Connect your Tilt Guard extension" in response.text
    assert "test-extension" in response.text
    assert "/login" in response.text
    assert "tilt-guard-token" in response.text
