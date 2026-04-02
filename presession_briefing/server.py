from __future__ import annotations

import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .errors import BriefingValidationError, LiveDataError
from .models import utc_now_iso
from .orchestrator import generate_session_brief
from .service import generate_live_response, service_capabilities, service_metadata


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _static_root() -> Path:
    return Path(__file__).resolve().parent / "static"


def _sample_path() -> Path:
    return _repo_root() / "data" / "sample_snapshot.json"


def _static_asset_path(request_path: str) -> Path | None:
    static_root = _static_root().resolve()
    decoded_path = unquote(request_path or "/")
    relative_path = "index.html" if decoded_path == "/" else decoded_path.lstrip("/")
    candidate = (static_root / relative_path).resolve()
    if not candidate.is_relative_to(static_root):
        return None
    return candidate if candidate.exists() and candidate.is_file() else None


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0"))
    if not content_length:
        return {}

    raw_payload = handler.rfile.read(content_length)
    payload = json.loads(raw_payload.decode("utf-8"))
    if not isinstance(payload, dict):
        raise BriefingValidationError("Request body must be a JSON object.")
    return payload


class BriefingHandler(BaseHTTPRequestHandler):
    server_version = "PreSessionBriefing/0.2.0"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_common_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json({"ok": True, "service": service_metadata(), "time": utc_now_iso()})
            return
        if parsed.path == "/api/capabilities":
            self._send_json(service_capabilities())
            return
        if parsed.path == "/api/sample":
            payload = json.loads(_sample_path().read_text(encoding="utf-8"))
            self._send_json(payload)
            return
        if parsed.path == "/api/live-snapshot":
            try:
                from .live_data import build_live_snapshot

                self._send_json(build_live_snapshot())
            except LiveDataError as exc:
                self._send_json(
                    {"error": str(exc), "code": "live_data_unavailable"},
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )
            except Exception as exc:  # pragma: no cover
                self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        asset = _static_asset_path(parsed.path)
        if asset is None:
            self.send_error(HTTPStatus.NOT_FOUND, "Asset not found")
            return

        content_type, _ = mimetypes.guess_type(str(asset))
        self._send_bytes(asset.read_bytes(), content_type or "application/octet-stream")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/generate-live":
            try:
                request_payload = _read_json_body(self)
                response_payload = generate_live_response(request_payload)
            except json.JSONDecodeError as exc:
                self._send_json({"error": f"Invalid JSON: {exc}"}, status=HTTPStatus.BAD_REQUEST)
                return
            except BriefingValidationError as exc:
                self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return
            except LiveDataError as exc:
                self._send_json(
                    {"error": str(exc), "code": "live_data_unavailable"},
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return
            except Exception as exc:  # pragma: no cover
                self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
                return
            self._send_json(response_payload)
            return

        if parsed.path != "/api/generate":
            self.send_error(HTTPStatus.NOT_FOUND, "Route not found")
            return

        try:
            payload = _read_json_body(self)
            result = generate_session_brief(payload)
        except json.JSONDecodeError as exc:
            self._send_json({"error": f"Invalid JSON: {exc}"}, status=HTTPStatus.BAD_REQUEST)
            return
        except BriefingValidationError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:  # pragma: no cover
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self._send_json(result)

    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, payload: bytes, content_type: str) -> None:
        self.send_response(HTTPStatus.OK)
        self._send_common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")


def main() -> None:
    host = os.environ.get("PRESSESSION_BRIEFING_HOST", "127.0.0.1")
    port = int(os.environ.get("PRESSESSION_BRIEFING_PORT", "8080"))
    server = ThreadingHTTPServer((host, port), BriefingHandler)
    print(f"Serving pre-session briefing UI at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
