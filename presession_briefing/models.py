from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass(slots=True)
class MarketContext:
    region: str = "US"
    trading_date: str = ""
    session_label: str = "pre-market"
    market: str = "us-index-futures"
    local_timezone: str = ""
    primary_timezone: str = "America/New_York"
    local_now: str = ""
    primary_now: str = ""
    session_phase: str = ""
    next_phase: str = ""
    phase_note: str = ""

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "MarketContext":
        return cls(
            region=str(payload.get("region", "US")),
            trading_date=str(payload.get("trading_date", "")),
            session_label=str(payload.get("session_label", "pre-market")),
            market=str(payload.get("market", "us-index-futures")),
            local_timezone=str(payload.get("local_timezone", "")),
            primary_timezone=str(payload.get("primary_timezone", "America/New_York")),
            local_now=str(payload.get("local_now", "")),
            primary_now=str(payload.get("primary_now", "")),
            session_phase=str(payload.get("session_phase", "")),
            next_phase=str(payload.get("next_phase", "")),
            phase_note=str(payload.get("phase_note", "")),
        )


@dataclass(slots=True)
class MacroSnapshot:
    spx_futures_pct: float = 0.0
    ndx_futures_pct: float = 0.0
    rty_futures_pct: float = 0.0
    vix_pct: float = 0.0
    us10y_yield_bps: float = 0.0
    dxy_pct: float = 0.0
    btc_pct: float = 0.0
    overnight_moves: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "MacroSnapshot":
        return cls(
            spx_futures_pct=float(payload.get("spx_futures_pct", 0.0)),
            ndx_futures_pct=float(payload.get("ndx_futures_pct", 0.0)),
            rty_futures_pct=float(payload.get("rty_futures_pct", 0.0)),
            vix_pct=float(payload.get("vix_pct", 0.0)),
            us10y_yield_bps=float(payload.get("us10y_yield_bps", 0.0)),
            dxy_pct=float(payload.get("dxy_pct", 0.0)),
            btc_pct=float(payload.get("btc_pct", 0.0)),
            overnight_moves=[str(item) for item in payload.get("overnight_moves", [])],
            notes=[str(item) for item in payload.get("notes", [])],
        )


@dataclass(slots=True)
class NewsItem:
    headline: str
    sentiment: str
    impact: str
    category: str = "macro"
    source: str = ""
    published_at: str = ""
    link: str = ""

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "NewsItem":
        return cls(
            headline=str(payload.get("headline", "")).strip(),
            sentiment=str(payload.get("sentiment", "neutral")).strip().lower(),
            impact=str(payload.get("impact", "medium")).strip().lower(),
            category=str(payload.get("category", "macro")).strip().lower(),
            source=str(payload.get("source", "")).strip(),
            published_at=str(payload.get("published_at", "")).strip(),
            link=str(payload.get("link", "")).strip(),
        )


@dataclass(slots=True)
class SectorFlow:
    sector: str
    direction: str
    strength: float
    reason: str = ""

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "SectorFlow":
        return cls(
            sector=str(payload.get("sector", "")).strip(),
            direction=str(payload.get("direction", "neutral")).strip().lower(),
            strength=float(payload.get("strength", 0.0)),
            reason=str(payload.get("reason", "")).strip(),
        )


@dataclass(slots=True)
class SocialSnapshot:
    enabled: bool = False
    sentiment_score: float = 0.0
    summary_points: list[str] = field(default_factory=list)
    caution_flags: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "SocialSnapshot":
        return cls(
            enabled=bool(payload.get("enabled", False)),
            sentiment_score=float(payload.get("sentiment_score", 0.0)),
            summary_points=[str(item) for item in payload.get("summary_points", [])],
            caution_flags=[str(item) for item in payload.get("caution_flags", [])],
        )


@dataclass(slots=True)
class RiskFlag:
    name: str
    severity: str = "medium"
    kind: str = "general"
    starts_at: str = ""
    market_relevance: str = "medium"

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RiskFlag":
        return cls(
            name=str(payload.get("name", "")).strip(),
            severity=str(payload.get("severity", "medium")).strip().lower(),
            kind=str(payload.get("kind", "general")).strip().lower(),
            starts_at=str(payload.get("starts_at", "")).strip(),
            market_relevance=str(payload.get("market_relevance", "medium")).strip().lower(),
        )


@dataclass(slots=True)
class SessionSnapshot:
    generated_at: str
    market_context: MarketContext
    macro: MacroSnapshot
    news: list[NewsItem]
    sector_flows: list[SectorFlow]
    social: SocialSnapshot
    risk_flags: list[RiskFlag]

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "SessionSnapshot":
        return cls(
            generated_at=str(payload.get("generated_at") or utc_now_iso()),
            market_context=MarketContext.from_dict(payload.get("market_context", {})),
            macro=MacroSnapshot.from_dict(payload.get("macro", {})),
            news=[NewsItem.from_dict(item) for item in payload.get("news", [])],
            sector_flows=[SectorFlow.from_dict(item) for item in payload.get("sector_flows", [])],
            social=SocialSnapshot.from_dict(payload.get("social", {})),
            risk_flags=[RiskFlag.from_dict(item) for item in payload.get("risk_flags", [])],
        )


@dataclass(slots=True)
class ComponentResult:
    score: float
    summary: str
    drivers: list[str] = field(default_factory=list)
    themes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class SessionBrief:
    generated_at: str
    session_bias: str
    directional_bias: str
    confidence: str
    session_phase: str
    next_phase: str
    market_regime: str
    trade_posture: str
    best_conditions: list[str]
    avoid_conditions: list[str]
    event_windows: list[str]
    top_drivers: list[str]
    watchlist_themes: list[str]
    red_flags: list[str]
    tilt_guard_advice: list[str]
    component_scores: dict[str, float]
    narrative: str
    component_summaries: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
