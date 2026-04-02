import json
import unittest
from pathlib import Path

from presession_briefing.orchestrator import generate_session_brief


def _sample_payload() -> dict:
    root = Path(__file__).resolve().parents[2]
    return json.loads((root / "data" / "sample_snapshot.json").read_text(encoding="utf-8"))


class OrchestratorTests(unittest.TestCase):
    def test_sample_snapshot_produces_risk_on_briefing(self) -> None:
        result = generate_session_brief(_sample_payload())
        self.assertEqual(result["session_bias"], "bullish")
        self.assertEqual(result["directional_bias"], "bullish")
        self.assertIn(result["confidence"], {"low", "medium", "high"})
        self.assertTrue(result["top_drivers"])
        self.assertTrue(result["tilt_guard_advice"])
        self.assertIn("trade_posture", result)
        self.assertIn("best_conditions", result)
        self.assertIn("avoid_conditions", result)

    def test_negative_setup_produces_bearish_briefing(self) -> None:
        payload = _sample_payload()
        payload["macro"]["spx_futures_pct"] = -1.1
        payload["macro"]["ndx_futures_pct"] = -1.5
        payload["macro"]["rty_futures_pct"] = -1.0
        payload["macro"]["vix_pct"] = 12.0
        payload["macro"]["us10y_yield_bps"] = 7.5
        payload["news"] = [
            {
                "headline": "Payrolls surprised to the upside and pushed yields sharply higher",
                "sentiment": "negative",
                "impact": "high",
                "category": "macro"
            }
        ]
        payload["sector_flows"] = [
            {
                "sector": "Financials",
                "direction": "negative",
                "strength": 0.8,
                "reason": "broad selling pressure"
            }
        ]

        result = generate_session_brief(payload)
        self.assertEqual(result["session_bias"], "bearish")
        self.assertIn("Favor shorts", result["tilt_guard_advice"][0])
        self.assertTrue(result["trade_posture"])

    def test_event_risk_reduces_confidence(self) -> None:
        payload = _sample_payload()
        payload["risk_flags"] = [
            {"name": "CPI release", "severity": "high", "kind": "economic_calendar"},
            {"name": "FOMC minutes", "severity": "high", "kind": "central_bank"},
            {"name": "Large-cap earnings cluster", "severity": "high", "kind": "earnings"}
        ]

        result = generate_session_brief(payload)
        self.assertEqual(result["confidence"], "medium")
        self.assertGreaterEqual(result["component_scores"]["risk_load"], 1.0)


if __name__ == "__main__":
    unittest.main()
