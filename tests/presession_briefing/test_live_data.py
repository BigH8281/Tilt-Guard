from datetime import UTC, datetime
import unittest

from presession_briefing.live_data import (
    _current_trading_date,
    _headline_category,
    _headline_impact,
    _headline_sentiment,
    _resolve_market_symbol,
    _session_label,
    _source_health,
)


class LiveDataHelperTests(unittest.TestCase):
    def test_headline_classifier_detects_central_bank_risk(self) -> None:
        headline = "Fed minutes showed a more hawkish path for rates"
        self.assertEqual(_headline_category(headline), "central_bank")
        self.assertEqual(_headline_impact(headline), "high")
        self.assertEqual(_headline_sentiment(headline), "negative")

    def test_headline_classifier_detects_earnings_positive(self) -> None:
        headline = "Chipmaker earnings beat and upbeat guidance lifted tech sentiment"
        self.assertEqual(_headline_category(headline), "earnings")
        self.assertEqual(_headline_sentiment(headline), "positive")

    def test_trading_date_rolls_weekend_forward(self) -> None:
        saturday = datetime(2026, 3, 28, 9, 0, tzinfo=UTC)
        self.assertEqual(_current_trading_date(saturday).isoformat(), "2026-03-30")

    def test_session_label_pre_market(self) -> None:
        pre_market = datetime(2026, 3, 27, 12, 0, tzinfo=UTC)
        self.assertEqual(_session_label(pre_market), "pre-market")

    def test_market_symbol_resolution_uses_fallback_when_primary_missing(self) -> None:
        symbol, quote = _resolve_market_symbol(
            "dxy_pct",
            {
                "UUP": {"pct_change": 0.25},
            },
        )
        self.assertEqual(symbol, "UUP")
        self.assertEqual(quote["pct_change"], 0.25)

    def test_source_health_reports_disabled_and_degraded_states(self) -> None:
        self.assertEqual(_source_health(False, [], disabled=True)["status"], "disabled")
        self.assertEqual(_source_health(True, ["quotes: fallback used"])["status"], "degraded")


if __name__ == "__main__":
    unittest.main()
