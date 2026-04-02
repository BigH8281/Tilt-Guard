from __future__ import annotations

from statistics import fmean

from .models import ComponentResult, MacroSnapshot, NewsItem, RiskFlag, SectorFlow, SocialSnapshot


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def impact_weight(impact: str) -> float:
    return {
        "low": 0.4,
        "medium": 0.8,
        "high": 1.2,
    }.get(impact, 0.8)


def sentiment_weight(sentiment: str) -> float:
    return {
        "negative": -1.0,
        "neutral": 0.0,
        "positive": 1.0,
    }.get(sentiment, 0.0)


def severity_weight(severity: str) -> float:
    return {
        "low": 0.35,
        "medium": 0.7,
        "high": 1.0,
    }.get(severity, 0.7)


def score_macro(snapshot: MacroSnapshot) -> ComponentResult:
    drivers: list[str] = []
    themes: list[str] = []

    equity_impulse = clamp(
        fmean([snapshot.spx_futures_pct, snapshot.ndx_futures_pct, snapshot.rty_futures_pct]) * 1.45,
        -1.1,
        1.1,
    )
    vol_impulse = clamp((-snapshot.vix_pct) / 8.0, -0.9, 0.9)
    rates_impulse = clamp((-snapshot.us10y_yield_bps) / 8.0, -0.7, 0.7)
    dollar_impulse = clamp((-snapshot.dxy_pct) * 1.6, -0.45, 0.45)
    crypto_impulse = clamp(snapshot.btc_pct / 5.0, -0.3, 0.3)

    score = clamp(
        equity_impulse + vol_impulse + rates_impulse + dollar_impulse + crypto_impulse,
        -2.5,
        2.5,
    )

    if equity_impulse > 0.35:
        drivers.append(
            f"Index futures are constructive with S&P {snapshot.spx_futures_pct:+.2f}%, Nasdaq {snapshot.ndx_futures_pct:+.2f}%."
        )
    elif equity_impulse < -0.35:
        drivers.append(
            f"Index futures are under pressure with S&P {snapshot.spx_futures_pct:+.2f}%, Nasdaq {snapshot.ndx_futures_pct:+.2f}%."
        )

    if vol_impulse > 0.25:
        drivers.append(f"Volatility is easing with VIX {snapshot.vix_pct:+.2f}%, which supports risk appetite.")
    elif vol_impulse < -0.25:
        drivers.append(f"Volatility is rising with VIX {snapshot.vix_pct:+.2f}%, which argues for caution.")

    if rates_impulse > 0.2:
        drivers.append(f"Rates are softer with the US 10Y move at {snapshot.us10y_yield_bps:+.1f} bps.")
    elif rates_impulse < -0.2:
        drivers.append(f"Rates are backing up with the US 10Y move at {snapshot.us10y_yield_bps:+.1f} bps.")

    if dollar_impulse > 0.15:
        themes.append("Weaker dollar is supportive for risk and cyclicals.")
    elif dollar_impulse < -0.15:
        themes.append("Stronger dollar is a headwind for broad risk sentiment.")

    if crypto_impulse > 0.15:
        themes.append("Crypto is firm and adds to the broader speculative bid.")
    elif crypto_impulse < -0.15:
        themes.append("Crypto is soft and does not confirm a strong risk-on tape.")

    themes.extend(snapshot.overnight_moves[:2])
    themes.extend(snapshot.notes[:2])

    summary = (
        "Macro is supporting upside continuation in index futures."
        if score >= 0.4
        else "Macro is leaning against longs and supports downside continuation."
        if score <= -0.4
        else "Macro is mixed and not giving a clean directional edge."
    )
    return ComponentResult(score=round(score, 2), summary=summary, drivers=drivers[:3], themes=themes[:4])


def score_news(items: list[NewsItem]) -> ComponentResult:
    if not items:
        return ComponentResult(score=0.0, summary="No major headline skew supplied.")

    score = 0.0
    drivers: list[str] = []
    warnings: list[str] = []

    for item in items:
        weighted = sentiment_weight(item.sentiment) * impact_weight(item.impact)
        score += weighted
        message = f"{item.headline} [{item.category}, {item.impact}]"
        if weighted > 0:
            drivers.append(message)
        elif weighted < 0:
            warnings.append(message)

    score = clamp(score / max(len(items), 1), -2.0, 2.0)

    if score >= 0.35:
        summary = "Headline flow is adding upside pressure to index futures."
    elif score <= -0.35:
        summary = "Headline flow is adding downside pressure to index futures."
    else:
        summary = "Headline flow is mixed and not dominant."

    return ComponentResult(
        score=round(score, 2),
        summary=summary,
        drivers=drivers[:3],
        warnings=warnings[:3],
    )


def score_sector_flows(flows: list[SectorFlow]) -> ComponentResult:
    if not flows:
        return ComponentResult(score=0.0, summary="No sector leadership data supplied.")

    drivers: list[str] = []
    themes: list[str] = []
    score = 0.0

    for flow in flows:
        direction = {
            "negative": -1.0,
            "neutral": 0.0,
            "positive": 1.0,
        }.get(flow.direction, 0.0)
        weighted = direction * clamp(flow.strength, 0.0, 1.0)
        score += weighted
        if weighted > 0.35:
            themes.append(f"{flow.sector} bid: {flow.reason or 'clear leadership'}")
        elif weighted < -0.35:
            themes.append(f"{flow.sector} weak: {flow.reason or 'notably lagging'}")

    score = clamp(score / max(len(flows), 1) * 1.6, -2.0, 2.0)

    positive = [flow.sector for flow in flows if flow.direction == "positive" and flow.strength >= 0.55]
    negative = [flow.sector for flow in flows if flow.direction == "negative" and flow.strength >= 0.55]

    if positive:
        drivers.append("Leadership is showing up in " + ", ".join(positive[:3]) + ".")
    if negative:
        drivers.append("Relative weakness is concentrated in " + ", ".join(negative[:3]) + ".")

    summary = (
        "Sector breadth confirms the current futures direction."
        if abs(score) >= 0.35
        else "Sector breadth is not giving a clean confirmation."
    )
    return ComponentResult(score=round(score, 2), summary=summary, drivers=drivers[:3], themes=themes[:4])


def score_social(snapshot: SocialSnapshot) -> ComponentResult:
    if not snapshot.enabled:
        return ComponentResult(score=0.0, summary="Social sentiment disabled.")

    score = clamp(snapshot.sentiment_score * 0.7, -0.35, 0.35)
    summary = (
        "Retail chatter leans supportive but remains a weak signal."
        if score >= 0.12
        else "Retail chatter leans bearish but remains a weak signal."
        if score <= -0.12
        else "Retail chatter is neutral and not a tradable edge."
    )
    warnings = list(snapshot.caution_flags[:2])
    return ComponentResult(
        score=round(score, 2),
        summary=summary,
        drivers=list(snapshot.summary_points[:2]),
        warnings=warnings,
    )


def score_risk(flags: list[RiskFlag]) -> ComponentResult:
    if not flags:
        return ComponentResult(score=0.0, summary="No explicit event or volatility flags supplied.")

    risk_load = 0.0
    warnings: list[str] = []

    for flag in flags:
        risk_load += severity_weight(flag.severity)
        warnings.append(flag.name)

    risk_load = clamp(risk_load / 1.8, 0.0, 2.0)
    summary = "Scheduled or headline risk can disrupt clean intraday trends." if risk_load >= 0.8 else "Event risk is manageable for intraday trading."
    return ComponentResult(score=round(risk_load, 2), summary=summary, warnings=warnings[:4])
