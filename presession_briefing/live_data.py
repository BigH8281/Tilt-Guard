from __future__ import annotations

import html
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import feedparser
import requests
import yfinance as yf

from .errors import LiveDataError
from .models import utc_now_iso

USER_AGENT = "Mozilla/5.0 (compatible; PreSessionBriefing/0.2; +https://localhost)"
REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
}
GOOGLE_NEWS_BASE = "https://news.google.com/rss/search"
ECONOMIC_CALENDAR_URL = "https://www.investing.com/economic-calendar/"
NASDAQ_EARNINGS_URL = "https://api.nasdaq.com/api/calendar/earnings"
REDDIT_WSB_URL = "https://www.reddit.com/r/wallstreetbets/hot.json?limit=15"
LONDON_TZ = ZoneInfo("Europe/London")
NEW_YORK_TZ = ZoneInfo("America/New_York")

MARKET_SYMBOLS = {
    "spx_futures_pct": "ES=F",
    "ndx_futures_pct": "NQ=F",
    "rty_futures_pct": "RTY=F",
    "vix": "^VIX",
    "us10y": "^TNX",
    "dxy_pct": "DX-Y.NYB",
    "btc_pct": "BTC-USD",
}

MARKET_SYMBOL_FALLBACKS = {
    "dxy_pct": ("UUP",),
}

OVERNIGHT_SYMBOLS = {
    "Nikkei": "^N225",
    "Hang Seng": "^HSI",
    "Euro Stoxx 50": "^STOXX50E",
    "FTSE 100": "^FTSE",
}

SECTOR_SYMBOLS = {
    "Semiconductors": "SOXX",
    "Technology": "XLK",
    "Financials": "XLF",
    "Energy": "XLE",
    "Healthcare": "XLV",
    "Industrials": "XLI",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
    "Materials": "XLB",
}

X_ALERT_HANDLES = {
    "DeItaone": "Walter Bloomberg / Delta One",
    "financialjuice": "FinancialJuice",
    "firstsquawk": "First Squawk",
}

GOOGLE_NEWS_QUERIES = [
    "stock market OR S&P 500 OR Nasdaq OR Dow when:1d",
    "Federal Reserve OR CPI OR PCE OR payrolls OR treasury yields when:2d",
    "earnings OR guidance OR revenue OR EPS when:1d",
    "oil OR OPEC OR tariffs OR Iran OR Israel OR China when:1d",
]

POSITIVE_KEYWORDS = {
    "beat",
    "beats",
    "bullish",
    "cooled",
    "cooling",
    "ceasefire",
    "cut",
    "cuts",
    "dovish",
    "easing",
    "eases",
    "gain",
    "gains",
    "growth",
    "lower",
    "rally",
    "rebound",
    "soft-landing",
    "soft landing",
    "surge",
    "upbeat",
}

NEGATIVE_KEYWORDS = {
    "attack",
    "attacks",
    "ban",
    "crash",
    "cuts guidance",
    "downgrade",
    "hawkish",
    "higher",
    "hotter",
    "invasion",
    "layoffs",
    "miss",
    "misses",
    "recession",
    "sanctions",
    "selloff",
    "slump",
    "sticky",
    "strike",
    "tariff",
    "tariffs",
    "war",
    "warning",
}

HIGH_IMPACT_KEYWORDS = {
    "cpi",
    "pce",
    "fomc",
    "powell",
    "payroll",
    "nonfarm",
    "rates",
    "yield",
    "treasury",
    "ecb",
    "boj",
    "trump",
    "tariff",
    "iran",
    "israel",
    "opec",
    "earnings",
    "guidance",
}

MEGACAP_EARNINGS_KEYWORDS = {
    "aapl",
    "apple",
    "amzn",
    "amazon",
    "googl",
    "google",
    "meta",
    "microsoft",
    "msft",
    "nvda",
    "nvidia",
    "tesla",
    "tsla",
}

KEY_EVENT_KEYWORDS = {
    "auction",
    "consumer confidence",
    "cpi",
    "durable goods",
    "fomc",
    "gdp",
    "jobless",
    "nonfarm",
    "payroll",
    "pce",
    "pmi",
    "powell",
    "retail sales",
    "sentiment",
}

MARKET_RELEVANT_KEYWORDS = {
    "bank",
    "bitcoin",
    "bond",
    "boj",
    "china",
    "cpi",
    "crude",
    "dollar",
    "earnings",
    "ecb",
    "economy",
    "fed",
    "fomc",
    "futures",
    "gasoline",
    "guidance",
    "inflation",
    "iran",
    "israel",
    "jobs",
    "market",
    "nasdaq",
    "opec",
    "oil",
    "payroll",
    "powell",
    "rates",
    "revenue",
    "risk",
    "s&p",
    "stocks",
    "tariff",
    "tech",
    "treasury",
    "usd",
    "vix",
    "yield",
}

SOCIAL_POSITIVE_KEYWORDS = {"bull", "bullish", "rip", "squeeze", "breakout", "calls", "long"}
SOCIAL_NEGATIVE_KEYWORDS = {"bear", "bearish", "dump", "puts", "rug", "short", "fade"}
SOCIAL_MEME_TICKERS = {"GME", "AMC", "DJT", "PLTR", "TSLA", "NVDA"}
STOPWORD_TICKERS = {
    "A",
    "AI",
    "ALL",
    "CEO",
    "ETF",
    "ET",
    "GDP",
    "GMT",
    "IRS",
    "SEC",
    "THE",
    "USA",
    "USD",
    "YOLO",
}


def _request_json(url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    response = requests.get(url, headers=REQUEST_HEADERS, params=params, timeout=20)
    response.raise_for_status()
    return response.json()


def _request_text(url: str, params: dict[str, Any] | None = None) -> str:
    response = requests.get(url, headers=REQUEST_HEADERS, params=params, timeout=20)
    response.raise_for_status()
    return response.text


def _parse_rss(url: str) -> feedparser.FeedParserDict:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=20)
    response.raise_for_status()
    return feedparser.parse(response.content)


def _clean_headline(text: str) -> str:
    cleaned = html.unescape(re.sub(r"\s+", " ", text)).strip()
    cleaned = re.sub(r"^[\W_]+", "", cleaned)
    return cleaned


def _headline_key(text: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return re.sub(r"\s+", " ", normalized)


def _parse_rss_datetime(entry: Any) -> datetime | None:
    time_struct = entry.get("published_parsed") or entry.get("updated_parsed")
    if not time_struct:
        return None
    return datetime(*time_struct[:6], tzinfo=UTC)


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        numeric = float(value)
        if math.isnan(numeric):
            return None
        return numeric
    except (TypeError, ValueError):
        return None


def _current_trading_date(now_et: datetime | None = None) -> date:
    current_moment = (now_et or datetime.now(UTC)).astimezone(NEW_YORK_TZ)
    current = current_moment.date()
    while current.weekday() >= 5:
        current += timedelta(days=1)
    return current


def _session_label(now_et: datetime | None = None) -> str:
    current = (now_et or datetime.now(UTC)).astimezone(NEW_YORK_TZ)
    if current.weekday() >= 5:
        return "weekend"
    if current.time() < time(9, 30):
        return "pre-market"
    if current.time() < time(16, 0):
        return "regular"
    return "after-hours"


def _fetch_quote(symbol: str) -> dict[str, float]:
    ticker = yf.Ticker(symbol)
    info = ticker.fast_info
    last_price = _to_float(info.get("lastPrice"))
    previous_close = _to_float(info.get("previousClose"))

    if last_price is None or previous_close is None:
        history = ticker.history(period="5d", interval="1d", auto_adjust=False)
        if history.empty or len(history.index) < 2:
            raise LiveDataError(f"Unable to fetch usable market data for {symbol}")
        last_price = float(history["Close"].iloc[-1])
        previous_close = float(history["Close"].iloc[-2])

    if not previous_close:
        raise LiveDataError(f"Previous close missing for {symbol}")

    pct_change = ((last_price - previous_close) / previous_close) * 100.0
    return {
        "last_price": round(last_price, 4),
        "previous_close": round(previous_close, 4),
        "pct_change": round(pct_change, 2),
    }


def _fetch_quote_map(symbols: list[str]) -> tuple[dict[str, dict[str, float]], list[str]]:
    results: dict[str, dict[str, float]] = {}
    warnings: list[str] = []

    with ThreadPoolExecutor(max_workers=min(8, len(symbols) or 1)) as executor:
        future_map = {executor.submit(_fetch_quote, symbol): symbol for symbol in symbols}
        for future in as_completed(future_map):
            symbol = future_map[future]
            try:
                results[symbol] = future.result()
            except Exception as exc:
                warnings.append(f"{symbol}: {exc}")

    return results, warnings


def _resolve_market_symbol(metric_key: str, quotes: dict[str, dict[str, float]]) -> tuple[str | None, dict[str, float] | None]:
    candidates = (MARKET_SYMBOLS[metric_key], *MARKET_SYMBOL_FALLBACKS.get(metric_key, ()))
    for symbol in candidates:
        quote = quotes.get(symbol)
        if quote:
            return symbol, quote
    return None, None


def _source_health(required: bool, warnings: list[str], *, disabled: bool = False) -> dict[str, Any]:
    if disabled:
        return {
            "status": "disabled",
            "required": required,
            "warnings": [],
        }
    if warnings:
        return {
            "status": "degraded",
            "required": required,
            "warnings": warnings,
        }
    return {
        "status": "ok",
        "required": required,
        "warnings": [],
    }


def _format_dual_time(value: str) -> str:
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    london_text = moment.astimezone(LONDON_TZ).strftime("%H:%M London")
    new_york_text = moment.astimezone(NEW_YORK_TZ).strftime("%H:%M ET")
    return f"{london_text} / {new_york_text}"


def _format_local_and_et(value: str, local_tz: ZoneInfo) -> str:
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    local_text = moment.astimezone(local_tz).strftime("%H:%M")
    local_zone = moment.astimezone(local_tz).tzname() or str(local_tz)
    new_york_text = moment.astimezone(NEW_YORK_TZ).strftime("%H:%M ET")
    if local_tz == NEW_YORK_TZ:
        return new_york_text
    return f"{local_text} {local_zone} / {new_york_text}"


def _parse_market_cap(raw_value: str) -> float:
    digits = re.sub(r"[^0-9.]", "", raw_value or "")
    return float(digits) if digits else 0.0


def _headline_category(headline: str) -> str:
    text = headline.lower()
    if any(keyword in text for keyword in ("earnings", "guidance", "eps", "revenue", "quarter", "q1", "q2", "q3", "q4")):
        return "earnings"
    if any(keyword in text for keyword in ("fed", "fomc", "powell", "ecb", "boj", "rates", "yield")):
        return "central_bank"
    if any(keyword in text for keyword in ("iran", "israel", "russia", "ukraine", "tariff", "sanctions", "opec", "oil", "strait")):
        return "geopolitics"
    return "macro"


def _headline_impact(headline: str) -> str:
    text = headline.lower()
    if any(keyword in text for keyword in ("fomc", "powell", "cpi", "pce", "nonfarm", "payroll", "jobless", "treasury", "yield", "yields", "rates", "hawkish", "dovish", "opec", "iran", "israel", "tariff", "war", "strait of hormuz", "ecb", "boj")):
        return "high"
    if any(keyword in text for keyword in ("earnings", "guidance", "revenue", "eps", "quarter")):
        if any(keyword in text for keyword in MEGACAP_EARNINGS_KEYWORDS):
            return "high"
        return "medium"
    if any(keyword in text for keyword in ("stocks", "shares", "futures", "economy", "market", "bank")):
        return "medium"
    return "low"


def _headline_sentiment(headline: str) -> str:
    text = headline.lower()
    positive_hits = sum(1 for keyword in POSITIVE_KEYWORDS if keyword in text)
    negative_hits = sum(1 for keyword in NEGATIVE_KEYWORDS if keyword in text)
    if positive_hits > negative_hits:
        return "positive"
    if negative_hits > positive_hits:
        return "negative"
    return "neutral"


def _is_market_relevant(headline: str) -> bool:
    text = headline.lower()
    return any(keyword in text for keyword in MARKET_RELEVANT_KEYWORDS)


def _build_news_item(headline: str, source: str, published_at: datetime | None, link: str = "") -> dict[str, str]:
    return {
        "headline": headline,
        "sentiment": _headline_sentiment(headline),
        "impact": _headline_impact(headline),
        "category": _headline_category(headline),
        "source": source,
        "published_at": published_at.astimezone(UTC).isoformat() if published_at else "",
        "link": link,
    }


def _session_phase_profile(now_et: datetime) -> tuple[str, str, str]:
    current_time = now_et.time()
    if current_time >= time(18, 0) or current_time < time(0, 0):
        return ("Globex reopen", "Asia handoff", "Liquidity is thinner and headline reactions can overshoot.")
    if current_time < time(8, 30):
        return ("Overnight session", "US data window", "Overnight trends can persist, but conviction rises only when US participants engage.")
    if current_time < time(9, 30):
        return ("US pre-open", "Cash open", "This is the key data and positioning window for ES/NQ/RTY.")
    if current_time < time(10, 30):
        return ("Opening drive", "Morning continuation", "The open is price discovery; failed opening moves often set the first clean reversal.")
    if current_time < time(12, 0):
        return ("Morning continuation", "Midday rotation", "If breadth confirms, trend continuation is more likely than a full reversal.")
    if current_time < time(14, 0):
        return ("Midday rotation", "Afternoon trend", "Expect slower trade unless a catalyst hits; false breaks are common.")
    if current_time < time(15, 30):
        return ("Afternoon trend", "Cash close drive", "Trend continuation or squeeze extension becomes more likely as volume returns.")
    if current_time < time(16, 0):
        return ("Cash close drive", "Post-close", "Closing flows can distort direction and accelerate an existing trend.")
    if current_time < time(18, 0):
        return ("Post-close / settlement", "Globex reopen", "Index-futures pace slows, but fresh headlines can reset the overnight tone.")
    return ("Globex reopen", "Asia handoff", "Liquidity is thinner and headline reactions can overshoot.")


def _fetch_x_alert_news(max_age_hours: int = 18) -> list[dict[str, str]]:
    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
    items: list[dict[str, str]] = []

    for handle, source_label in X_ALERT_HANDLES.items():
        feed = _parse_rss(f"https://nitter.net/{handle}/rss")
        for entry in feed.entries[:20]:
            published_at = _parse_rss_datetime(entry)
            if published_at and published_at < cutoff:
                continue
            headline = _clean_headline(entry.get("title", ""))
            if not headline or not _is_market_relevant(headline):
                continue
            items.append(_build_news_item(headline, source_label, published_at, entry.get("link", "")))

    return items


def _fetch_google_news(max_age_hours: int = 36) -> list[dict[str, str]]:
    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
    items: list[dict[str, str]] = []

    for query in GOOGLE_NEWS_QUERIES:
        url = f"{GOOGLE_NEWS_BASE}?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
        feed = _parse_rss(url)
        for entry in feed.entries[:10]:
            published_at = _parse_rss_datetime(entry)
            if published_at and published_at < cutoff:
                continue
            headline = _clean_headline(entry.get("title", ""))
            if not headline or not _is_market_relevant(headline):
                continue
            items.append(_build_news_item(headline, "Google News", published_at, entry.get("link", "")))

    return items


def _collect_live_news() -> tuple[list[dict[str, str]], list[str]]:
    warnings: list[str] = []
    candidates: list[dict[str, str]] = []

    for source_name, loader in (("x_alerts", _fetch_x_alert_news), ("google_news", _fetch_google_news)):
        try:
            candidates.extend(loader())
        except Exception as exc:
            warnings.append(f"{source_name}: {exc}")

    priority = {
        "Walter Bloomberg / Delta One": 0,
        "FinancialJuice": 1,
        "First Squawk": 2,
        "Google News": 3,
    }
    impact_rank = {"high": 0, "medium": 1, "low": 2}

    deduped: dict[str, dict[str, str]] = {}
    for item in candidates:
        key = _headline_key(item["headline"])
        current = deduped.get(key)
        if current is None:
            deduped[key] = item
            continue
        current_rank = (
            priority.get(current.get("source", ""), 9),
            impact_rank.get(current["impact"], 9),
        )
        next_rank = (
            priority.get(item.get("source", ""), 9),
            impact_rank.get(item["impact"], 9),
        )
        if next_rank < current_rank:
            deduped[key] = item

    def sort_key(item: dict[str, str]) -> tuple[int, int, float]:
        published_at = item.get("published_at", "")
        timestamp = 0.0
        if published_at:
            try:
                timestamp = datetime.fromisoformat(published_at).timestamp()
            except ValueError:
                timestamp = 0.0
        return (
            priority.get(item.get("source", ""), 9),
            impact_rank.get(item["impact"], 9),
            -timestamp,
        )

    ranked = sorted(deduped.values(), key=sort_key)
    x_alerts = [item for item in ranked if item.get("source") != "Google News"]
    google_news = [item for item in ranked if item.get("source") == "Google News"]

    news = x_alerts[:4] + google_news[:6]
    if len(news) < 10:
        existing_keys = {_headline_key(item["headline"]) for item in news}
        for item in ranked:
            key = _headline_key(item["headline"])
            if key in existing_keys:
                continue
            news.append(item)
            existing_keys.add(key)
            if len(news) >= 10:
                break

    return news, warnings


def _build_macro_snapshot(quotes: dict[str, dict[str, float]]) -> dict[str, Any]:
    overnight_moves: list[str] = []
    for label, symbol in OVERNIGHT_SYMBOLS.items():
        quote = quotes.get(symbol)
        if not quote:
            continue
        overnight_moves.append(f"{label} {quote['pct_change']:+.2f}%")

    _, us10y_quote = _resolve_market_symbol("us10y", quotes)
    _, vix_quote = _resolve_market_symbol("vix", quotes)
    _, spx_quote = _resolve_market_symbol("spx_futures_pct", quotes)
    _, ndx_quote = _resolve_market_symbol("ndx_futures_pct", quotes)
    _, rty_quote = _resolve_market_symbol("rty_futures_pct", quotes)
    _, dxy_quote = _resolve_market_symbol("dxy_pct", quotes)
    _, btc_quote = _resolve_market_symbol("btc_pct", quotes)

    if not all((us10y_quote, vix_quote, spx_quote, ndx_quote, rty_quote, dxy_quote, btc_quote)):
        raise LiveDataError("Missing resolved core market quotes after fallback handling.")

    us10y_yield_bps = round((us10y_quote["last_price"] - us10y_quote["previous_close"]) * 100.0, 1)

    notes: list[str] = []
    if vix_quote["last_price"] >= 24:
        notes.append(f"VIX is elevated at {vix_quote['last_price']:.2f}.")
    if us10y_yield_bps <= -4:
        notes.append("Rates are easing materially into the session.")
    elif us10y_yield_bps >= 4:
        notes.append("Rates are rising materially into the session.")

    return {
        "spx_futures_pct": spx_quote["pct_change"],
        "ndx_futures_pct": ndx_quote["pct_change"],
        "rty_futures_pct": rty_quote["pct_change"],
        "vix_pct": vix_quote["pct_change"],
        "us10y_yield_bps": us10y_yield_bps,
        "dxy_pct": dxy_quote["pct_change"],
        "btc_pct": btc_quote["pct_change"],
        "overnight_moves": overnight_moves[:4],
        "notes": notes[:2],
    }


def _build_sector_flows(quotes: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
    flows: list[dict[str, Any]] = []
    for sector, symbol in SECTOR_SYMBOLS.items():
        quote = quotes.get(symbol)
        if not quote:
            continue
        pct_change = quote["pct_change"]
        direction = "positive" if pct_change > 0.15 else "negative" if pct_change < -0.15 else "neutral"
        strength = min(abs(pct_change) / 1.8, 1.0)
        if direction == "positive":
            reason = "leading sector ETF on the tape"
        elif direction == "negative":
            reason = "lagging sector ETF into the session"
        else:
            reason = "sector not showing a decisive move"
        flows.append(
            {
                "sector": sector,
                "direction": direction,
                "strength": round(strength, 2),
                "reason": reason,
            }
        )

    flows.sort(key=lambda item: abs(item["strength"]), reverse=True)
    return flows[:6]


def _build_social_snapshot() -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    try:
        payload = _request_json(REDDIT_WSB_URL)
    except Exception as exc:
        return {"enabled": False, "sentiment_score": 0.0, "summary_points": [], "caution_flags": []}, [f"reddit_social: {exc}"]

    posts = payload.get("data", {}).get("children", [])
    if not posts:
        return {"enabled": False, "sentiment_score": 0.0, "summary_points": [], "caution_flags": []}, warnings

    sentiment_total = 0.0
    weighted_posts = 0.0
    ticker_counts: dict[str, int] = {}

    for wrapper in posts[:12]:
        post = wrapper.get("data", {})
        title = _clean_headline(post.get("title", ""))
        score = max(int(post.get("score", 0)), 1)
        comments = max(int(post.get("num_comments", 0)), 0)
        weight = min(math.log(score + comments + 2), 5.0)
        lower_title = title.lower()
        post_sentiment = 0
        post_sentiment += sum(1 for keyword in SOCIAL_POSITIVE_KEYWORDS if keyword in lower_title)
        post_sentiment -= sum(1 for keyword in SOCIAL_NEGATIVE_KEYWORDS if keyword in lower_title)
        sentiment_total += post_sentiment * weight
        weighted_posts += weight

        for ticker in re.findall(r"\b[A-Z]{2,5}\b", title):
            if ticker in STOPWORD_TICKERS:
                continue
            ticker_counts[ticker] = ticker_counts.get(ticker, 0) + 1

    sentiment_score = 0.0
    if weighted_posts:
        sentiment_score = max(-1.0, min(1.0, sentiment_total / weighted_posts / 2.0))

    sorted_mentions = sorted(
        ((symbol, count) for symbol, count in ticker_counts.items() if count >= 2),
        key=lambda item: item[1],
        reverse=True,
    )
    summary_points: list[str] = []
    if sorted_mentions:
        top_tickers = ", ".join(symbol for symbol, _ in sorted_mentions[:3])
        summary_points.append(f"Retail chatter is clustering around {top_tickers}.")
    else:
        summary_points.append("Retail chatter is dispersed without a dominant ticker focus.")

    caution_flags: list[str] = []
    if sorted_mentions and sorted_mentions[0][1] >= 3:
        caution_flags.append(f"Retail attention is crowded in {sorted_mentions[0][0]}.")
    if any(symbol in SOCIAL_MEME_TICKERS for symbol, _ in sorted_mentions[:3]):
        caution_flags.append("Meme-stock traffic is elevated, so treat retail momentum as a weak signal.")

    return {
        "enabled": True,
        "sentiment_score": round(sentiment_score, 2),
        "summary_points": summary_points[:2],
        "caution_flags": caution_flags[:2],
    }, warnings


def _economic_risk_flags(trading_date: date, local_tz: ZoneInfo) -> tuple[list[dict[str, str]], list[str]]:
    warnings: list[str] = []
    try:
        page = _request_text(ECONOMIC_CALENDAR_URL)
    except Exception as exc:
        return [], [f"economic_calendar: {exc}"]

    match = re.search(r'__NEXT_DATA__" type="application/json">(.*?)</script>', page, re.S)
    if not match:
        return [], ["economic_calendar: state not found in Investing response."]

    data = json.loads(match.group(1))
    store = data.get("props", {}).get("pageProps", {}).get("state", {}).get("economicCalendarStore", {})
    events = store.get("calendarEventsByDate", {}).get(trading_date.isoformat(), [])
    now_utc = datetime.now(UTC)
    flags: list[dict[str, str]] = []

    for event in events:
        if event.get("currency") != "USD":
            continue
        importance = int(event.get("importance") or 0)
        event_name = str(event.get("eventLong") or event.get("event") or "").strip()
        lower_name = event_name.lower()
        if importance < 2 and not event.get("isSpeech"):
            continue
        if not event_name:
            continue
        if importance < 3 and not event.get("isSpeech") and not any(keyword in lower_name for keyword in KEY_EVENT_KEYWORDS):
            continue

        event_time = str(event.get("time") or "")
        if event_time:
            moment = datetime.fromisoformat(event_time.replace("Z", "+00:00"))
            if moment < now_utc - timedelta(hours=1):
                continue
            timing_text = _format_local_and_et(event_time, local_tz)
        else:
            timing_text = "time not supplied"

        severity = "high" if importance >= 3 or any(keyword in lower_name for keyword in ("powell", "fomc", "cpi", "pce", "nonfarm", "payroll")) else "medium"
        flags.append(
            {
                "name": f"{event_name} at {timing_text}",
                "severity": severity,
                "kind": "economic_calendar",
                "starts_at": event_time,
                "market_relevance": "high" if severity == "high" else "medium",
            }
        )

    return flags[:4], warnings


def _earnings_risk_flags(trading_date: date) -> tuple[list[dict[str, str]], list[str]]:
    warnings: list[str] = []
    try:
        payload = _request_json(
            NASDAQ_EARNINGS_URL,
            params={"date": trading_date.isoformat()},
        )
    except Exception as exc:
        return [], [f"earnings_calendar: {exc}"]

    rows = payload.get("data", {}).get("rows", [])
    if not rows:
        return [], warnings

    sorted_rows = sorted(rows, key=lambda row: _parse_market_cap(row.get("marketCap", "")), reverse=True)
    total_count = len(rows)
    large_caps = [row["name"] for row in sorted_rows[:3] if _parse_market_cap(row.get("marketCap", "")) >= 10_000_000_000]
    flags: list[dict[str, str]] = []

    if total_count >= 40 or large_caps:
        severity = "high" if total_count >= 60 or len(large_caps) >= 2 else "medium"
        company_text = ""
        if large_caps:
            company_text = " including " + ", ".join(large_caps[:3])
        flags.append(
            {
                "name": f"Earnings-heavy day with {total_count} Nasdaq-listed reports{company_text}",
                "severity": severity,
                "kind": "earnings",
                "market_relevance": "medium",
            }
        )

    return flags, warnings


def _volatility_risk_flags(quotes: dict[str, dict[str, float]]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    spx_move = abs(quotes[MARKET_SYMBOLS["spx_futures_pct"]]["pct_change"])
    ndx_move = abs(quotes[MARKET_SYMBOLS["ndx_futures_pct"]]["pct_change"])
    vix_quote = quotes[MARKET_SYMBOLS["vix"]]

    if spx_move >= 1.0 or ndx_move >= 1.3:
        flags.append(
            {
                "name": f"Gap risk is elevated with S&P futures {quotes[MARKET_SYMBOLS['spx_futures_pct']]['pct_change']:+.2f}% and Nasdaq futures {quotes[MARKET_SYMBOLS['ndx_futures_pct']]['pct_change']:+.2f}%",
                "severity": "high",
                "kind": "gap_risk",
                "market_relevance": "high",
            }
        )

    if vix_quote["last_price"] >= 25 or vix_quote["pct_change"] >= 8.0:
        flags.append(
            {
                "name": f"Volatility is elevated with VIX at {vix_quote['last_price']:.2f} ({vix_quote['pct_change']:+.2f}%)",
                "severity": "high" if vix_quote["last_price"] >= 28 else "medium",
                "kind": "volatility",
                "market_relevance": "high",
            }
        )

    return flags[:2]


def build_live_snapshot(region: str = "US", include_social: bool = True, market: str = "us-index-futures", local_timezone: str | None = None) -> dict[str, Any]:
    now_utc = datetime.now(UTC)
    now_et = now_utc.astimezone(NEW_YORK_TZ)
    trading_date = _current_trading_date(now_et)
    local_tz = ZoneInfo(local_timezone) if local_timezone else LONDON_TZ
    phase, next_phase, phase_note = _session_phase_profile(now_et)

    all_symbols = list({
        *MARKET_SYMBOLS.values(),
        *(symbol for fallbacks in MARKET_SYMBOL_FALLBACKS.values() for symbol in fallbacks),
        *OVERNIGHT_SYMBOLS.values(),
        *SECTOR_SYMBOLS.values(),
    })
    quotes, quote_warnings = _fetch_quote_map(all_symbols)

    missing_core_symbols = [
        metric_key
        for metric_key in MARKET_SYMBOLS
        if _resolve_market_symbol(metric_key, quotes)[1] is None
    ]
    if missing_core_symbols:
        raise LiveDataError(f"Missing live market data for: {', '.join(missing_core_symbols)}")

    for metric_key, primary_symbol in MARKET_SYMBOLS.items():
        resolved_symbol, _ = _resolve_market_symbol(metric_key, quotes)
        if resolved_symbol and resolved_symbol != primary_symbol:
            quote_warnings.append(
                f"quotes: using fallback symbol {resolved_symbol} for {metric_key} because {primary_symbol} was unavailable"
            )

    news_items, news_warnings = _collect_live_news()
    social_snapshot, social_warnings = _build_social_snapshot() if include_social else (
        {"enabled": False, "sentiment_score": 0.0, "summary_points": [], "caution_flags": []},
        [],
    )

    economic_flags, econ_warnings = _economic_risk_flags(trading_date, local_tz)
    earnings_flags, earnings_warnings = _earnings_risk_flags(trading_date)
    volatility_flags = _volatility_risk_flags(quotes)

    snapshot = {
        "generated_at": utc_now_iso(),
        "market_context": {
            "region": region,
            "trading_date": trading_date.isoformat(),
            "session_label": _session_label(now_et),
            "market": market,
            "local_timezone": str(local_tz),
            "primary_timezone": str(NEW_YORK_TZ),
            "local_now": now_utc.astimezone(local_tz).replace(microsecond=0).isoformat(),
            "primary_now": now_et.replace(microsecond=0).isoformat(),
            "session_phase": phase,
            "next_phase": next_phase,
            "phase_note": phase_note,
        },
        "macro": _build_macro_snapshot(quotes),
        "news": news_items,
        "sector_flows": _build_sector_flows(quotes),
        "social": social_snapshot,
        "risk_flags": economic_flags + earnings_flags + volatility_flags,
        "_meta": {
            "live_data": True,
            "fetched_at": now_utc.replace(microsecond=0).isoformat(),
            "sources": {
                "quotes": "Yahoo Finance via yfinance",
                "x_alerts": list(X_ALERT_HANDLES.values()),
                "news": "Google News RSS",
                "social": "Reddit r/wallstreetbets hot feed" if include_social else "disabled",
                "calendar": "Investing.com economic calendar + Nasdaq earnings calendar (forex.com blocked in automated access)",
            },
            "source_health": {
                "quotes": _source_health(True, quote_warnings),
                "x_alerts": _source_health(False, [warning for warning in news_warnings if warning.startswith("x_alerts:")]),
                "google_news": _source_health(False, [warning for warning in news_warnings if warning.startswith("google_news:")]),
                "reddit_social": _source_health(False, social_warnings, disabled=not include_social),
                "economic_calendar": _source_health(False, econ_warnings),
                "earnings_calendar": _source_health(False, earnings_warnings),
            },
            "warnings": quote_warnings + news_warnings + social_warnings + econ_warnings + earnings_warnings,
        },
    }
    return snapshot
