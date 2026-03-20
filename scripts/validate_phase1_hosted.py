import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import uuid
from urllib.parse import urljoin

import requests


TEST_PNG_BYTES = bytes.fromhex(
    "89504E470D0A1A0A"
    "0000000D49484452"
    "0000000100000001"
    "08060000001F15C489"
    "0000000D49444154"
    "789C6360F8CFC0000003010100C9FE92EF"
    "0000000049454E44AE426082"
)


class ValidationError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate hosted-critical Phase 1 API flows against a local or hosted Tilt-Guard backend.",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        choices=["full", "persistence-prepare", "persistence-verify"],
        default="full",
        help="Validation mode. Defaults to the existing full hosted API validation.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("VALIDATION_BASE_URL", "http://127.0.0.1:8000"),
        help="API base URL, e.g. http://127.0.0.1:8000 or https://api.example.com",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.getenv("VALIDATION_TIMEOUT_SECONDS", "20")),
        help="Per-request timeout in seconds.",
    )
    parser.add_argument(
        "--state-file",
        default=os.getenv("PERSISTENCE_CHECK_STATE_FILE", "tmp/phase1_screenshot_persistence.json"),
        help="Path to the local state file used by persistence-prepare and persistence-verify.",
    )
    parser.add_argument(
        "--skip-cleanup",
        action="store_true",
        help="Leave the disposable verification session open after persistence-verify succeeds.",
    )
    return parser.parse_args()


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def build_test_user() -> tuple[str, str]:
    unique_suffix = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
    email = f"phase1-validation-{unique_suffix}@example.com"
    password = f"Phase1!{uuid.uuid4().hex[:10]}"
    return email, password


def build_test_image_hash() -> str:
    return hashlib.sha256(TEST_PNG_BYTES).hexdigest()


def api_request(
    session: requests.Session,
    base_url: str,
    method: str,
    path: str,
    *,
    timeout: float,
    expected_status: int,
    token: str | None = None,
    **kwargs,
):
    url = urljoin(f"{base_url.rstrip('/')}/", path.lstrip("/"))
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = session.request(method, url, headers=headers, timeout=timeout, **kwargs)
    if response.status_code != expected_status:
        detail = response.text
        try:
            payload = response.json()
            detail = payload.get("detail", payload)
        except ValueError:
            pass
        raise ValidationError(
            f"{method} {url} returned {response.status_code}, expected {expected_status}. Detail: {detail}"
        )

    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return response.json()
    return response


def fetch_asset(session: requests.Session, base_url: str, asset_path: str, *, timeout: float) -> requests.Response:
    asset_url = urljoin(f"{base_url.rstrip('/')}/", asset_path.lstrip("/"))
    response = session.get(asset_url, timeout=timeout)
    if response.status_code != 200:
        raise ValidationError(f"GET {asset_url} returned {response.status_code}, expected 200.")
    return response


def write_state_file(state_file: Path, payload: dict) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_state_file(state_file: Path) -> dict:
    if not state_file.exists():
        raise ValidationError(f"State file not found: {state_file}")
    return json.loads(state_file.read_text(encoding="utf-8"))


def remove_state_file(state_file: Path) -> None:
    if state_file.exists():
        state_file.unlink()


def login_user(
    session: requests.Session,
    base_url: str,
    email: str,
    password: str,
    *,
    timeout: float,
) -> str:
    login_response = api_request(
        session,
        base_url,
        "POST",
        "/login",
        timeout=timeout,
        expected_status=200,
        json={"email": email, "password": password},
    )
    return login_response["access_token"]


def close_session_for_cleanup(
    session: requests.Session,
    base_url: str,
    token: str,
    session_id: int,
    *,
    timeout: float,
) -> None:
    api_request(
        session,
        base_url,
        "POST",
        f"/sessions/{session_id}/upload",
        timeout=timeout,
        expected_status=201,
        token=token,
        data={"screenshot_type": "post"},
        files={"file": ("post-cleanup.png", TEST_PNG_BYTES, "image/png")},
    )
    api_request(
        session,
        base_url,
        "POST",
        f"/sessions/{session_id}/end",
        timeout=timeout,
        expected_status=200,
        token=token,
        json={
            "end_traded_my_time": True,
            "end_traded_my_conditions": True,
            "end_respected_my_exit": True,
        },
    )


def run_full_validation(http: requests.Session, base_url: str, *, timeout: float) -> None:
    print(f"[1/11] Health check: {base_url}/health")
    health = api_request(
        http,
        base_url,
        "GET",
        "/health",
        timeout=timeout,
        expected_status=200,
    )
    assert_true(health.get("status") == "ok", "Health response did not return status=ok.")

    email, password = build_test_user()
    print(f"[2/11] Register disposable user: {email}")
    register_response = api_request(
        http,
        base_url,
        "POST",
        "/register",
        timeout=timeout,
        expected_status=201,
        json={"email": email, "password": password},
    )
    register_token = register_response["access_token"]

    print("[3/11] Read current user")
    me = api_request(
        http,
        base_url,
        "GET",
        "/me",
        timeout=timeout,
        expected_status=200,
        token=register_token,
    )
    assert_true(me["email"] == email, "Authenticated user email did not match the registered email.")

    print("[4/11] Login with the same disposable user")
    token = login_user(
        http,
        base_url,
        email,
        password,
        timeout=timeout,
    )

    print("[5/11] Create session and update setup")
    created_session = api_request(
        http,
        base_url,
        "POST",
        "/sessions",
        timeout=timeout,
        expected_status=201,
        token=token,
        json={"session_name": "Validation Session", "symbol": "MNQ"},
    )
    session_id = created_session["id"]
    updated_session = api_request(
        http,
        base_url,
        "PATCH",
        f"/sessions/{session_id}/setup",
        timeout=timeout,
        expected_status=200,
        token=token,
        json={
            "market_bias": "bullish",
            "htf_condition": "trend day",
            "expected_open_type": "continuation",
            "confidence": 7,
        },
    )
    assert_true(updated_session["confidence"] == 7, "Session setup update did not persist confidence.")

    print("[6/11] Validate open session and session detail read-back")
    open_session = api_request(
        http,
        base_url,
        "GET",
        "/sessions/open",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    session_detail = api_request(
        http,
        base_url,
        "GET",
        f"/sessions/{session_id}",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    assert_true(open_session["id"] == session_id, "Open session did not match the newly created session.")
    assert_true(session_detail["status"] == "open", "Session detail did not return an open session.")

    print("[7/11] Create journal entry and validate read-back")
    journal_content = f"Hosted validation entry {uuid.uuid4().hex[:8]}"
    created_entry = api_request(
        http,
        base_url,
        "POST",
        f"/sessions/{session_id}/journal",
        timeout=timeout,
        expected_status=201,
        token=token,
        json={"content": journal_content},
    )
    journal_entries = api_request(
        http,
        base_url,
        "GET",
        f"/sessions/{session_id}/journal",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    assert_true(
        any(entry["id"] == created_entry["id"] and entry["content"] == journal_content for entry in journal_entries),
        "Journal read-back did not include the created entry.",
    )

    print("[8/11] Upload journal screenshot and validate file serving")
    journal_screenshot = api_request(
        http,
        base_url,
        "POST",
        f"/sessions/{session_id}/upload",
        timeout=timeout,
        expected_status=201,
        token=token,
        data={"screenshot_type": "journal"},
        files={"file": ("journal-validation.png", TEST_PNG_BYTES, "image/png")},
    )
    screenshot_asset = fetch_asset(http, base_url, journal_screenshot["file_url"], timeout=timeout)
    assert_true(
        screenshot_asset.headers.get("content-type", "").startswith("image/png"),
        "Uploaded screenshot did not serve back as image/png.",
    )

    print("[9/11] Upload post-session screenshot and validate screenshot list")
    post_screenshot = api_request(
        http,
        base_url,
        "POST",
        f"/sessions/{session_id}/upload",
        timeout=timeout,
        expected_status=201,
        token=token,
        data={"screenshot_type": "post"},
        files={"file": ("post-validation.png", TEST_PNG_BYTES, "image/png")},
    )
    screenshots = api_request(
        http,
        base_url,
        "GET",
        f"/sessions/{session_id}/screenshots",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    screenshot_ids = {item["id"] for item in screenshots}
    assert_true(journal_screenshot["id"] in screenshot_ids, "Journal screenshot did not appear in list_screenshots.")
    assert_true(post_screenshot["id"] in screenshot_ids, "Post screenshot did not appear in list_screenshots.")

    print("[10/11] Close session")
    closed_session = api_request(
        http,
        base_url,
        "POST",
        f"/sessions/{session_id}/end",
        timeout=timeout,
        expected_status=200,
        token=token,
        json={
            "end_traded_my_time": True,
            "end_traded_my_conditions": True,
            "end_respected_my_exit": True,
        },
    )
    assert_true(closed_session["status"] == "closed", "Session closeout did not return status=closed.")

    print("[11/11] Validate closed session history and no remaining open session")
    listed_sessions = api_request(
        http,
        base_url,
        "GET",
        "/sessions",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    assert_true(
        any(item["id"] == session_id and item["status"] == "closed" for item in listed_sessions),
        "Closed session did not appear in session history.",
    )

    open_session_response = http.get(
        urljoin(f"{base_url.rstrip('/')}/", "sessions/open"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=timeout,
    )
    assert_true(
        open_session_response.status_code == 404,
        f"Expected no open session after closeout, got {open_session_response.status_code}.",
    )

    print("Phase 1 hosted API validation passed.")
    print(f"Disposable validation user: {email}")
    print(f"Validated base URL: {base_url}")


def run_persistence_prepare(http: requests.Session, base_url: str, state_file: Path, *, timeout: float) -> None:
    print(f"[1/4] Health check: {base_url}/health")
    health = api_request(
        http,
        base_url,
        "GET",
        "/health",
        timeout=timeout,
        expected_status=200,
    )
    assert_true(health.get("status") == "ok", "Health response did not return status=ok.")

    email, password = build_test_user()
    print(f"[2/4] Register disposable user: {email}")
    register_response = api_request(
        http,
        base_url,
        "POST",
        "/register",
        timeout=timeout,
        expected_status=201,
        json={"email": email, "password": password},
    )
    token = register_response["access_token"]

    print("[3/4] Create disposable session")
    created_session = api_request(
        http,
        base_url,
        "POST",
        "/sessions",
        timeout=timeout,
        expected_status=201,
        token=token,
        json={"session_name": "Persistence Smoke Check", "symbol": "MNQ"},
    )
    session_id = created_session["id"]

    print("[4/4] Upload screenshot and save verification state")
    screenshot = api_request(
        http,
        base_url,
        "POST",
        f"/sessions/{session_id}/upload",
        timeout=timeout,
        expected_status=201,
        token=token,
        data={"screenshot_type": "journal"},
        files={"file": ("persistence-check.png", TEST_PNG_BYTES, "image/png")},
    )
    screenshot_asset = fetch_asset(http, base_url, screenshot["file_url"], timeout=timeout)
    assert_true(
        hashlib.sha256(screenshot_asset.content).hexdigest() == build_test_image_hash(),
        "Uploaded screenshot did not match the expected test image bytes before redeploy.",
    )

    state = {
        "base_url": base_url,
        "email": email,
        "password": password,
        "session_id": session_id,
        "screenshot_id": screenshot["id"],
        "file_url": screenshot["file_url"],
        "expected_sha256": build_test_image_hash(),
    }
    write_state_file(state_file, state)
    print("Screenshot persistence prepare step passed.")
    print(f"State file written to: {state_file}")
    print("Redeploy or restart the backend, then run persistence-verify with the same state file.")


def run_persistence_verify(
    http: requests.Session,
    base_url: str,
    state_file: Path,
    *,
    timeout: float,
    cleanup: bool,
) -> None:
    state = read_state_file(state_file)
    state_base_url = state["base_url"].rstrip("/")
    if state_base_url != base_url:
        print(f"State file base URL: {state_base_url}")
        print(f"Verification base URL: {base_url}")

    print(f"[1/5] Health check after redeploy: {base_url}/health")
    health = api_request(
        http,
        base_url,
        "GET",
        "/health",
        timeout=timeout,
        expected_status=200,
    )
    assert_true(health.get("status") == "ok", "Health response did not return status=ok after redeploy.")

    print("[2/5] Login with stored disposable user")
    token = login_user(
        http,
        base_url,
        state["email"],
        state["password"],
        timeout=timeout,
    )

    session_id = int(state["session_id"])
    screenshot_id = int(state["screenshot_id"])

    print("[3/5] Validate session and screenshot metadata read-back")
    session_detail = api_request(
        http,
        base_url,
        "GET",
        f"/sessions/{session_id}",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    assert_true(session_detail["status"] == "open", "Persistence smoke-check session was not open after redeploy.")

    screenshots = api_request(
        http,
        base_url,
        "GET",
        f"/sessions/{session_id}/screenshots",
        timeout=timeout,
        expected_status=200,
        token=token,
    )
    matching = next((item for item in screenshots if item["id"] == screenshot_id), None)
    assert_true(matching is not None, "Prepared screenshot was missing from the screenshot list after redeploy.")
    assert_true(
        matching["file_url"] == state["file_url"],
        "Prepared screenshot file_url changed unexpectedly after redeploy.",
    )

    print("[4/5] Fetch persisted screenshot file")
    screenshot_asset = fetch_asset(http, base_url, state["file_url"], timeout=timeout)
    assert_true(
        screenshot_asset.headers.get("content-type", "").startswith("image/png"),
        "Persisted screenshot did not serve back as image/png after redeploy.",
    )
    assert_true(
        hashlib.sha256(screenshot_asset.content).hexdigest() == state["expected_sha256"],
        "Persisted screenshot bytes no longer match the original upload after redeploy.",
    )

    if cleanup:
        print("[5/5] Close disposable smoke-check session")
        close_session_for_cleanup(
            http,
            base_url,
            token,
            session_id,
            timeout=timeout,
        )
        remove_state_file(state_file)
        print("Screenshot persistence verify step passed and cleanup completed.")
        print(f"Removed state file: {state_file}")
    else:
        print("[5/5] Cleanup skipped")
        print("Screenshot persistence verify step passed.")
        print("The disposable session remains open until you run persistence-verify without --skip-cleanup.")


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    state_file = Path(args.state_file)
    http = requests.Session()

    try:
        if args.mode == "full":
            run_full_validation(http, base_url, timeout=args.timeout)
        elif args.mode == "persistence-prepare":
            run_persistence_prepare(http, base_url, state_file, timeout=args.timeout)
        else:
            run_persistence_verify(
                http,
                base_url,
                state_file,
                timeout=args.timeout,
                cleanup=not args.skip_cleanup,
            )
        return 0
    except (requests.RequestException, ValidationError) as exc:
        print(f"Phase 1 hosted API validation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
