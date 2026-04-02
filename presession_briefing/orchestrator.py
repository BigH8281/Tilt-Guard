from __future__ import annotations

from datetime import UTC, datetime, timedelta

from .analyzers import score_macro, score_news, score_risk, score_sector_flows, score_social
from .models import SessionBrief, SessionSnapshot, utc_now_iso


def _confidence_from_signal(composite_score: float, disagreement_penalty: float, risk_load: float) -> str:
    conviction = abs(composite_score) * 1.3 - disagreement_penalty - (risk_load * 0.45)
    if conviction >= 0.85:
        return "high"
    if conviction >= 0.3:
        return "medium"
    return "low"


def _session_bias_from_score(composite_score: float, disagreement_penalty: float) -> str:
    if abs(composite_score) < 0.25 or disagreement_penalty >= 0.75:
        return "mixed"
    if composite_score > 0:
        return "bullish"
    return "bearish"


def _build_advice(session_bias: str, confidence: str, risk_load: float) -> list[str]:
    advice: list[str] = []

    if session_bias == "bullish":
        advice.append("Favor longs on pullbacks or opening acceptance higher; avoid forcing shorts into trend strength.")
    elif session_bias == "bearish":
        advice.append("Favor shorts on failed bounces or weak opens; avoid forcing longs into a heavy tape.")
    else:
        advice.append("Treat the open as rotational until one side proves control; avoid overcommitting early.")

    if risk_load >= 0.9:
        advice.append("Reduce size around scheduled events and headline-sensitive windows because intraday reversals can be sharp.")
    elif risk_load >= 0.45:
        advice.append("Keep trade duration tighter until the first key catalyst passes.")

    if confidence == "low":
        advice.append("Do not overfit a weak signal set; wait for the first clean auction before pressing.")
    elif confidence == "high":
        advice.append("You can be more decisive, but only if opening price action confirms the directional read.")

    return advice[:3]


def _market_regime(snapshot: SessionSnapshot, session_bias: str, confidence: str, risk_load: float, news_score: float, sector_score: float) -> str:
    phase = snapshot.market_context.session_phase.lower()
    if risk_load >= 1.0 and abs(news_score) >= 0.25:
        return "headline-driven"
    if "midday" in phase:
        return "midday rotation"
    if "open" in phase or "morning" in phase:
        if session_bias == "bearish" and confidence in {"medium", "high"} and sector_score <= -0.5:
            return "trend-down continuation"
        if session_bias == "bullish" and confidence in {"medium", "high"} and sector_score >= 0.5:
            return "trend-up continuation"
        return "open-drive discovery"
    if "afternoon" in phase or "close" in phase:
        if confidence == "high":
            return "late-session expansion"
        return "afternoon rotation"
    return "overnight / transition"


def _trade_posture(session_bias: str, regime: str, phase: str) -> str:
    phase_lower = phase.lower()
    if session_bias == "bearish":
        if "midday" in phase_lower:
            return "Bias stays short, but expect slower follow-through unless a fresh catalyst hits."
        if "close" in phase_lower or "afternoon" in phase_lower:
            return "Stay with downside continuation unless buyers reclaim and hold prior breakdown areas."
        return "Default posture is to sell rallies and failed reclaims rather than pick bottoms."
    if session_bias == "bullish":
        if "midday" in phase_lower:
            return "Bias stays long, but expect slower continuation unless breadth re-accelerates."
        if "close" in phase_lower or "afternoon" in phase_lower:
            return "Stay with upside continuation unless sellers retake the morning pivot cleanly."
        return "Default posture is to buy pullbacks and failed breakdowns rather than fade strength."
    if regime == "headline-driven":
        return "Treat the tape as two-way and headline-sensitive until one side holds after the reaction."
    return "Treat the tape as rotational until a clean acceptance and breadth shift appear."


def _best_conditions(session_bias: str, regime: str, phase: str) -> list[str]:
    if session_bias == "bearish":
        conditions = [
            "Short failed bounces into prior breakdown areas or opening range resistance.",
            "Press downside continuation only when NQ and ES stay aligned.",
            "Use fresh negative headlines to join trend, not to chase the first impulsive flush.",
        ]
    elif session_bias == "bullish":
        conditions = [
            "Buy pullbacks that hold above reclaimed support or the opening range low.",
            "Press upside continuation only when ES and NQ are both accepting higher.",
            "Use positive macro or headline catalysts to join trend, not to chase the first spike.",
        ]
    else:
        conditions = [
            "Fade failed breakouts only after the market snaps back inside the range.",
            "Wait for a second test before committing size in a two-way tape.",
            "Keep expectations modest until breadth or news gives one side control.",
        ]

    if regime == "midday rotation":
        conditions[2] = "Prioritize cleaner pullback entries over breakout chasing during the midday lull."
    elif regime == "headline-driven":
        conditions[2] = "Trade after the first reaction settles; the second move is often cleaner than the headline spike."
    return conditions[:3]


def _avoid_conditions(session_bias: str, risk_load: float, phase: str) -> list[str]:
    avoid = [
        "Avoid trading directly into scheduled data or speaker windows without a clear plan.",
        "Avoid oversized size when volatility is elevated and range expansion is already underway.",
    ]
    if session_bias == "bearish":
        avoid.append("Avoid forcing countertrend longs unless buyers can reclaim and hold key intraday levels.")
    elif session_bias == "bullish":
        avoid.append("Avoid forcing countertrend shorts unless sellers can reclaim and hold key intraday levels.")
    else:
        avoid.append("Avoid assuming a trend day before the market proves it outside the current range.")

    if "midday" in phase.lower() and risk_load < 0.9:
        avoid[1] = "Avoid forcing momentum trades during the midday slowdown unless volume returns."
    return avoid[:3]


def _event_windows(snapshot: SessionSnapshot) -> list[str]:
    upcoming: list[tuple[datetime, str]] = []
    now = datetime.now(UTC)
    for flag in snapshot.risk_flags:
        if not flag.starts_at:
            continue
        try:
            moment = datetime.fromisoformat(flag.starts_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if now - timedelta(minutes=10) <= moment <= now + timedelta(hours=8):
            upcoming.append((moment, flag.name))
    upcoming.sort(key=lambda item: item[0])
    return [label for _, label in upcoming[:4]]


def _clamp_score(value: float) -> int:
    rounded = int(round(value))
    return max(-10, min(10, rounded))


def _category_news_score(snapshot: SessionSnapshot, category: str) -> float:
    scores = []
    for item in snapshot.news:
        if item.category != category:
            continue
        sentiment = 1.0 if item.sentiment == "positive" else -1.0 if item.sentiment == "negative" else 0.0
        impact = 1.3 if item.impact == "high" else 0.8 if item.impact == "medium" else 0.35
        scores.append(sentiment * impact)
    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def _bias_table(snapshot: SessionSnapshot, macro_score: float, news_score: float, sector_score: float) -> dict:
    rates_base = ((-snapshot.macro.us10y_yield_bps) * 0.9) + ((-snapshot.macro.dxy_pct) * 3.0) + (_category_news_score(snapshot, "central_bank") * 4.5)
    macro_base = (macro_score * 3.2) + (_category_news_score(snapshot, "macro") * 4.0)
    politics_base = _category_news_score(snapshot, "geopolitics") * 6.0
    corporate_base = (_category_news_score(snapshot, "earnings") * 5.0) + (sector_score * 2.5)
    cross_asset_base = ((-snapshot.macro.dxy_pct) * 3.0) + ((-snapshot.macro.us10y_yield_bps) * 0.7) + (snapshot.macro.btc_pct * 0.6)

    category_rows = [
        (
            "Macro & Economic Data",
            {
                "gold": ((-snapshot.macro.us10y_yield_bps) * 1.2) + ((-snapshot.macro.dxy_pct) * 4.2) - (macro_score * 0.9),
                "nq": macro_base * 1.0,
                "mes": macro_base * 0.95,
                "bitcoin": (macro_base * 0.85) + (snapshot.macro.btc_pct * 0.9),
            },
        ),
        (
            "Central Banks & Rates",
            {
                "gold": rates_base * 1.15,
                "nq": rates_base * 1.15,
                "mes": rates_base * 1.0,
                "bitcoin": rates_base * 0.95,
            },
        ),
        (
            "Politics & Geopolitics",
            {
                "gold": politics_base * -0.95,
                "nq": politics_base * 0.95,
                "mes": politics_base * 0.9,
                "bitcoin": politics_base * 0.75,
            },
        ),
        (
            "Corporate / Tech / Earnings",
            {
                "gold": corporate_base * 0.2,
                "nq": corporate_base * 1.25,
                "mes": corporate_base * 0.9,
                "bitcoin": corporate_base * 0.55,
            },
        ),
        (
            "Cross-Asset (FX, Bonds, Commodities)",
            {
                "gold": ((-snapshot.macro.dxy_pct) * 4.0) + ((-snapshot.macro.us10y_yield_bps) * 1.0) - (snapshot.macro.btc_pct * 0.2),
                "nq": cross_asset_base * 1.0,
                "mes": cross_asset_base * 0.95,
                "bitcoin": ((-snapshot.macro.dxy_pct) * 3.2) + ((-snapshot.macro.us10y_yield_bps) * 0.55) + (snapshot.macro.btc_pct * 1.35),
            },
        ),
    ]

    rows = []
    totals = {"gold": 0.0, "nq": 0.0, "mes": 0.0, "bitcoin": 0.0}
    for category, values in category_rows:
        row = {"category": category}
        for index_name in ("gold", "nq", "mes", "bitcoin"):
            value = _clamp_score(values[index_name])
            row[index_name] = value
            totals[index_name] += value
        rows.append(row)

    averages = {index_name: round(totals[index_name] / len(category_rows), 1) for index_name in totals}
    return {"rows": rows, "averages": averages}


def _impact_channels(category: str) -> list[str]:
    mapping = {
        "macro": ["Treasury yields", "USD", "broad risk appetite", "index breadth"],
        "central_bank": ["rates repricing", "USD", "mega-cap tech multiples", "index-futures volatility"],
        "geopolitics": ["oil", "defensives", "headline volatility", "risk appetite"],
        "earnings": ["tech leadership", "sector rotation", "index breadth", "market internals"],
    }
    return mapping.get(category, ["risk appetite", "USD", "yields", "sector rotation"])


def _story_bias(item, category: str) -> dict[str, int]:
    sentiment = 1.0 if item.sentiment == "positive" else -1.0 if item.sentiment == "negative" else 0.0
    impact = 1.6 if item.impact == "high" else 1.0 if item.impact == "medium" else 0.5
    base = sentiment * impact * 4.0
    if category == "central_bank":
        return {
            "gold": _clamp_score(base * 1.1),
            "nq": _clamp_score(base * 1.2),
            "mes": _clamp_score(base),
            "bitcoin": _clamp_score(base * 0.95),
        }
    if category == "earnings":
        return {
            "gold": _clamp_score(base * 0.2),
            "nq": _clamp_score(base * 1.3),
            "mes": _clamp_score(base * 0.9),
            "bitcoin": _clamp_score(base * 0.5),
        }
    if category == "geopolitics":
        return {
            "gold": _clamp_score(base * -1.0),
            "nq": _clamp_score(base),
            "mes": _clamp_score(base * 0.9),
            "bitcoin": _clamp_score(base * 0.8),
        }
    return {
        "gold": _clamp_score(base * 0.75),
        "nq": _clamp_score(base),
        "mes": _clamp_score(base * 0.9),
        "bitcoin": _clamp_score(base * 0.85),
    }


def _channel_impacts(item) -> list[dict[str, str]]:
    sentiment = item.sentiment
    category = item.category
    if category == "geopolitics":
        if sentiment == "negative":
            return [
                {"channel": "Oil", "direction": "up"},
                {"channel": "Defensives", "direction": "up"},
                {"channel": "Volatility", "direction": "up"},
                {"channel": "Risk appetite", "direction": "down"},
            ]
        return [
            {"channel": "Oil", "direction": "down"},
            {"channel": "Defensives", "direction": "down"},
            {"channel": "Volatility", "direction": "down"},
            {"channel": "Risk appetite", "direction": "up"},
        ]
    if category == "central_bank":
        if sentiment == "negative":
            return [
                {"channel": "Yields", "direction": "up"},
                {"channel": "USD", "direction": "up"},
                {"channel": "Tech", "direction": "down"},
                {"channel": "Index futures", "direction": "down"},
            ]
        return [
            {"channel": "Yields", "direction": "down"},
            {"channel": "USD", "direction": "down"},
            {"channel": "Tech", "direction": "up"},
            {"channel": "Index futures", "direction": "up"},
        ]
    if category == "earnings":
        if sentiment == "negative":
            return [
                {"channel": "Tech leadership", "direction": "down"},
                {"channel": "Breadth", "direction": "down"},
                {"channel": "Risk appetite", "direction": "down"},
                {"channel": "Bitcoin", "direction": "down"},
            ]
        return [
            {"channel": "Tech leadership", "direction": "up"},
            {"channel": "Breadth", "direction": "up"},
            {"channel": "Risk appetite", "direction": "up"},
            {"channel": "Bitcoin", "direction": "up"},
        ]
    if sentiment == "negative":
        return [
            {"channel": "Yields", "direction": "up"},
            {"channel": "USD", "direction": "up"},
            {"channel": "Gold", "direction": "up"},
            {"channel": "Index futures", "direction": "down"},
        ]
    return [
        {"channel": "Yields", "direction": "down"},
        {"channel": "USD", "direction": "down"},
        {"channel": "Gold", "direction": "down"},
        {"channel": "Index futures", "direction": "up"},
    ]


def _story_summary(item) -> str:
    category_label = item.category.replace("_", " ")
    return f"{item.headline}. This is being treated as a {item.impact}-impact {category_label} driver for index futures."


def _story_reasoning(item) -> str:
    if item.category == "central_bank":
        return "NQ usually reacts hardest because rates and discounting hit long-duration tech first, while MES follows through broader macro positioning and Gold responds through real yields and USD."
    if item.category == "earnings":
        return "NQ is most sensitive when leadership tech or growth stories shift, while MES usually follows more broadly and Bitcoin tends to react through liquidity and sentiment spillover."
    if item.category == "geopolitics":
        return "Geopolitical headlines typically hit futures through oil, defensives, volatility, and safe-haven demand rather than through single-stock fundamentals."
    return "Macro stories usually move futures through yields, USD, and broad risk appetite, while Gold and Bitcoin can diverge depending on the liquidity and safe-haven mix."


def _story_breakdown(snapshot: SessionSnapshot) -> list[dict]:
    stories = []
    for item in snapshot.news[:6]:
        stories.append(
            {
                "title": item.headline,
                "timestamp": item.published_at,
                "source": item.source,
                "link": item.link,
                "category": item.category,
                "summary": _story_summary(item),
                "impact_channels": _impact_channels(item.category),
                "channel_impacts": _channel_impacts(item),
                "bias_scores": _story_bias(item, item.category),
                "reasoning": _story_reasoning(item),
            }
        )
    return stories


def _dashboard(snapshot: SessionSnapshot, bias_table: dict, event_windows: list[str], session_bias: str) -> list[dict]:
    drivers = {
        "gold": ["Real yields", "USD direction", "Geopolitical demand"],
        "nq": ["Rates and duration", "Tech leadership", "Headline volatility"],
        "mes": ["Broad risk appetite", "Macro calendar", "Sector breadth"],
        "bitcoin": ["Liquidity tone", "USD direction", "Risk appetite"],
    }
    notes = {
        "gold": "Gold often diverges from equities when yields and geopolitics matter more than pure risk sentiment.",
        "nq": "Sensitive to rates, large-cap tech, and any abrupt shift in headline risk.",
        "mes": "Broadest read on US equity risk, but still driven hard by data windows and flows.",
        "bitcoin": "Bitcoin can track liquidity and risk appetite, but headline shocks still create sharp air pockets.",
    }
    caveat = event_windows[0] if event_windows else "No immediate scheduled event window, but monitor headline flow."
    return [
        {"index": "Gold", "avg_bias": bias_table["averages"]["gold"], "key_drivers": drivers["gold"], "notes": f"{notes['gold']} {caveat}"},
        {"index": "NQ", "avg_bias": bias_table["averages"]["nq"], "key_drivers": drivers["nq"], "notes": f"{notes['nq']} {caveat}"},
        {"index": "MES", "avg_bias": bias_table["averages"]["mes"], "key_drivers": drivers["mes"], "notes": f"{notes['mes']} Current directional read is {session_bias}."},
        {"index": "Bitcoin", "avg_bias": bias_table["averages"]["bitcoin"], "key_drivers": drivers["bitcoin"], "notes": f"{notes['bitcoin']} {caveat}"},
    ]


def _build_narrative(session_bias: str, confidence: str, phase: str, regime: str, phase_note: str, macro_summary: str, news_summary: str, sector_summary: str, risk_summary: str) -> str:
    return " ".join(
        (
        f"US index futures are {session_bias} with {confidence} confidence during {phase.lower()}. "
        f"Current regime looks {regime}. {phase_note} {macro_summary} {news_summary} {sector_summary} {risk_summary}"
        ).split()
    )


def generate_session_brief(payload: dict) -> dict:
    snapshot = SessionSnapshot.from_dict(payload)
    macro = score_macro(snapshot.macro)
    news = score_news(snapshot.news)
    sector = score_sector_flows(snapshot.sector_flows)
    social = score_social(snapshot.social)
    risk = score_risk(snapshot.risk_flags)

    core_scores = [macro.score, news.score, sector.score]
    positive_count = sum(1 for value in core_scores if value > 0.2)
    negative_count = sum(1 for value in core_scores if value < -0.2)
    disagreement_penalty = 0.0
    if positive_count and negative_count:
        disagreement_penalty = 0.85
    elif max(core_scores) - min(core_scores) > 1.15:
        disagreement_penalty = 0.45

    composite_score = (
        macro.score * 0.45 +
        news.score * 0.25 +
        sector.score * 0.25 +
        social.score * 0.05
    )

    session_bias = _session_bias_from_score(composite_score, disagreement_penalty)
    confidence = _confidence_from_signal(composite_score, disagreement_penalty, risk.score)
    regime = _market_regime(snapshot, session_bias, confidence, risk.score, news.score, sector.score)
    phase = snapshot.market_context.session_phase or snapshot.market_context.session_label
    event_windows = _event_windows(snapshot)

    top_drivers = (
        macro.drivers +
        news.drivers +
        sector.drivers +
        social.drivers
    )[:5]

    watchlist_themes = (
        sector.themes +
        macro.themes +
        social.warnings
    )[:5]

    red_flags = (risk.warnings + news.warnings + social.warnings)[:5]

    narrative = _build_narrative(
        session_bias=session_bias,
        confidence=confidence,
        phase=phase,
        regime=regime,
        phase_note=snapshot.market_context.phase_note,
        macro_summary=macro.summary,
        news_summary=news.summary,
        sector_summary=sector.summary,
        risk_summary=risk.summary,
    )

    brief = SessionBrief(
        generated_at=utc_now_iso(),
        session_bias=session_bias,
        directional_bias=session_bias,
        confidence=confidence,
        session_phase=phase,
        next_phase=snapshot.market_context.next_phase,
        market_regime=regime,
        trade_posture=_trade_posture(session_bias, regime, phase),
        best_conditions=_best_conditions(session_bias, regime, phase),
        avoid_conditions=_avoid_conditions(session_bias, risk.score, phase),
        event_windows=event_windows,
        top_drivers=top_drivers,
        watchlist_themes=watchlist_themes,
        red_flags=red_flags,
        tilt_guard_advice=_build_advice(session_bias, confidence, risk.score),
        component_scores={
            "macro": macro.score,
            "news": news.score,
            "sector": sector.score,
            "social": social.score,
            "risk_load": risk.score,
            "composite": round(composite_score, 2),
        },
        narrative=narrative,
        component_summaries={
            "macro": macro.summary,
            "news": news.summary,
            "sector": sector.summary,
            "social": social.summary,
            "risk": risk.summary,
        },
    )
    result = brief.to_dict()
    result["bias_table"] = _bias_table(snapshot, macro.score, news.score, sector.score)
    result["story_breakdown"] = _story_breakdown(snapshot)
    result["dashboard"] = _dashboard(snapshot, result["bias_table"], event_windows, session_bias)
    return result
