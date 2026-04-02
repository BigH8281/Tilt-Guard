from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ChartConfig:
    key: str
    period: str
    interval: str
    title: str
    bars: int
    resample_rule: str | None = None
    show_vwap: bool = False


CHART_CONFIGS = [
    ChartConfig("1D", "6mo", "1d", "Daily", 120),
    ChartConfig("4H", "60d", "60m", "4 Hour", 72, resample_rule="4h"),
    ChartConfig("1H", "10d", "60m", "1 Hour", 72, show_vwap=True),
]

TRACKED_SYMBOLS = {
    "Gold": "GC=F",
    "NQ": "NQ=F",
    "MES": "MES=F",
    "Bitcoin": "BTC-USD",
}
