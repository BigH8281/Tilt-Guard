import unittest
from unittest.mock import patch

from presession_briefing.errors import BriefingValidationError
from presession_briefing.service import generate_live_response, normalize_live_request, service_capabilities


class ServiceLayerTests(unittest.TestCase):
    def test_normalize_live_request_uses_defaults(self) -> None:
        request = normalize_live_request({})
        self.assertEqual(request["market"], "us-index-futures")
        self.assertTrue(request["include_snapshot"])
        self.assertTrue(request["include_social"])
        self.assertTrue(request["include_charts"])
        self.assertEqual(request["chart_symbols"], ["Gold", "NQ", "MES", "Bitcoin"])
        self.assertEqual(request["chart_timeframes"], ["1D", "4H", "1H"])

    def test_normalize_live_request_filters_invalid_values(self) -> None:
        request = normalize_live_request(
            {
                "include_snapshot": "false",
                "include_social": "no",
                "include_charts": "1",
                "chart_symbols": ["NQ", "INVALID"],
                "chart_timeframes": ["4H", "BAD"],
            }
        )
        self.assertFalse(request["include_snapshot"])
        self.assertFalse(request["include_social"])
        self.assertTrue(request["include_charts"])
        self.assertEqual(request["chart_symbols"], ["NQ"])
        self.assertEqual(request["chart_timeframes"], ["4H"])

    def test_normalize_live_request_rejects_invalid_timezone(self) -> None:
        with self.assertRaises(BriefingValidationError):
            normalize_live_request({"local_timezone": "Mars/Olympus"})

    @patch("presession_briefing.service._build_chart_pack")
    @patch("presession_briefing.service.generate_session_brief")
    @patch("presession_briefing.service._build_live_snapshot")
    def test_generate_live_response_honors_flags(self, live_snapshot, generate_brief, build_chart_pack) -> None:
        live_snapshot.return_value = {
            "generated_at": "2026-03-27T00:00:00+00:00",
            "_meta": {"warnings": [], "source_health": {"quotes": {"status": "ok", "warnings": []}}},
        }
        generate_brief.return_value = {"session_bias": "mixed"}
        build_chart_pack.return_value = {"NQ": [{"timeframe": "4H"}]}

        response = generate_live_response(
            {
                "include_snapshot": False,
                "include_charts": True,
                "chart_symbols": ["NQ"],
                "chart_timeframes": ["4H"],
            }
        )

        self.assertIn("service", response)
        self.assertEqual(response["briefing"]["session_bias"], "mixed")
        self.assertNotIn("snapshot", response)
        self.assertEqual(response["charts"], {"NQ": [{"timeframe": "4H"}]})
        self.assertEqual(response["source_health"]["quotes"]["status"], "ok")
        build_chart_pack.assert_called_once_with(symbols=["NQ"], timeframe_keys=["4H"])

    @patch("presession_briefing.service._build_chart_pack", side_effect=RuntimeError("chart vendor timed out"))
    @patch("presession_briefing.service.generate_session_brief")
    @patch("presession_briefing.service._build_live_snapshot")
    def test_generate_live_response_degrades_when_chart_pack_fails(self, live_snapshot, generate_brief, build_chart_pack) -> None:
        live_snapshot.return_value = {
            "generated_at": "2026-03-27T00:00:00+00:00",
            "_meta": {"warnings": ["quotes: degraded"], "source_health": {"quotes": {"status": "degraded", "warnings": ["quotes: degraded"]}}},
        }
        generate_brief.return_value = {"session_bias": "mixed"}

        response = generate_live_response({"include_charts": True})

        self.assertEqual(response["charts"], {})
        self.assertEqual(response["warnings"], ["quotes: degraded", "charts: chart vendor timed out"])
        self.assertEqual(response["source_health"]["quotes"]["status"], "degraded")
        build_chart_pack.assert_called_once()

    @patch("presession_briefing.service._charting_available", return_value=False)
    @patch("presession_briefing.service._build_chart_pack")
    @patch("presession_briefing.service.generate_session_brief")
    @patch("presession_briefing.service._build_live_snapshot")
    def test_generate_live_response_skips_charts_when_runtime_is_unavailable(
        self,
        live_snapshot,
        generate_brief,
        build_chart_pack,
        _charting_available,
    ) -> None:
        live_snapshot.return_value = {
            "generated_at": "2026-03-27T00:00:00+00:00",
            "_meta": {"warnings": [], "source_health": {"quotes": {"status": "ok", "warnings": []}}},
        }
        generate_brief.return_value = {"session_bias": "mixed"}

        response = generate_live_response({"include_charts": True})

        self.assertNotIn("charts", response)
        self.assertNotIn("warnings", response)
        build_chart_pack.assert_not_called()

    def test_service_capabilities_describes_api(self) -> None:
        capabilities = service_capabilities()
        self.assertEqual(capabilities["service"]["api_version"], "v1")
        self.assertEqual(capabilities["service"]["version"], "0.2.0")
        self.assertIn("US index futures", capabilities["markets"][0]["label"])
        self.assertIn("symbols", capabilities["charts"])

    @patch("presession_briefing.service._charting_available", return_value=False)
    def test_service_capabilities_flags_when_charting_is_unavailable(self, _charting_available) -> None:
        capabilities = service_capabilities()
        self.assertFalse(capabilities["options"]["include_charts"])
        self.assertFalse(capabilities["charts"]["available"])


if __name__ == "__main__":
    unittest.main()
