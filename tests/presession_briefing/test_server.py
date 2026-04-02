import json
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from unittest.mock import patch

from presession_briefing.errors import LiveDataError
from presession_briefing.server import BriefingHandler


class ServerEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[2]
        self.static_fixture = root / "presession_briefing" / "static" / "test-assets" / "ping.txt"
        self.static_fixture.parent.mkdir(parents=True, exist_ok=True)
        self.static_fixture.write_text("ok", encoding="utf-8")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), BriefingHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        time.sleep(0.05)
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)
        self.static_fixture.unlink(missing_ok=True)
        try:
            self.static_fixture.parent.rmdir()
        except OSError:
            pass

    def test_health_endpoint(self) -> None:
        with urlopen(f"{self.base_url}/api/health", timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 200)
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["service"]["name"], "pre-session-briefing")

    def test_capabilities_endpoint(self) -> None:
        with urlopen(f"{self.base_url}/api/capabilities", timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 200)
            self.assertIn("charts", payload)
            self.assertIn("symbols", payload["charts"])

    def test_static_asset_allows_valid_nested_path(self) -> None:
        with urlopen(f"{self.base_url}/test-assets/ping.txt", timeout=3) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read().decode("utf-8"), "ok")

    def test_static_asset_rejects_traversal(self) -> None:
        with self.assertRaises(HTTPError) as context:
            urlopen(f"{self.base_url}/../../README.md", timeout=3)
        self.assertEqual(context.exception.code, 404)

    def test_static_asset_rejects_encoded_traversal(self) -> None:
        encoded = quote("../../README.md", safe="")
        with self.assertRaises(HTTPError) as context:
            urlopen(f"{self.base_url}/{encoded}", timeout=3)
        self.assertEqual(context.exception.code, 404)

    @patch("presession_briefing.server.generate_live_response")
    def test_generate_live_endpoint(self, generate_live_response) -> None:
        generate_live_response.return_value = {
            "service": {"name": "pre-session-briefing"},
            "briefing": {"session_bias": "bearish"},
        }
        request = Request(
            f"{self.base_url}/api/generate-live",
            data=json.dumps({"include_charts": False}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 200)
            self.assertEqual(payload["briefing"]["session_bias"], "bearish")
            generate_live_response.assert_called_once()

    def test_generate_live_endpoint_rejects_invalid_timezone(self) -> None:
        request = Request(
            f"{self.base_url}/api/generate-live",
            data=json.dumps({"local_timezone": "Mars/Olympus"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=3)
        payload = json.loads(context.exception.read().decode("utf-8"))
        self.assertEqual(context.exception.code, 400)
        self.assertIn("Invalid local_timezone", payload["error"])

    def test_generate_live_endpoint_rejects_non_object_payload(self) -> None:
        request = Request(
            f"{self.base_url}/api/generate-live",
            data=json.dumps(["bad"]).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=3)
        payload = json.loads(context.exception.read().decode("utf-8"))
        self.assertEqual(context.exception.code, 400)
        self.assertEqual(payload["error"], "Request body must be a JSON object.")

    def test_generate_live_endpoint_rejects_invalid_json(self) -> None:
        request = Request(
            f"{self.base_url}/api/generate-live",
            data=b"{bad",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=3)
        payload = json.loads(context.exception.read().decode("utf-8"))
        self.assertEqual(context.exception.code, 400)
        self.assertIn("Invalid JSON", payload["error"])

    @patch("presession_briefing.server.generate_live_response", side_effect=LiveDataError("quotes unavailable"))
    def test_generate_live_endpoint_handles_live_data_failures(self, _: object) -> None:
        request = Request(
            f"{self.base_url}/api/generate-live",
            data=json.dumps({"include_charts": False}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=3)
        payload = json.loads(context.exception.read().decode("utf-8"))
        self.assertEqual(context.exception.code, 503)
        self.assertEqual(payload["code"], "live_data_unavailable")


if __name__ == "__main__":
    unittest.main()
