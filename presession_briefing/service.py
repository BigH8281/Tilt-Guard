from __future__ import annotations

from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .chart_config import CHART_CONFIGS, TRACKED_SYMBOLS
from .errors import BriefingValidationError
from .models import utc_now_iso
from .orchestrator import generate_session_brief
from .version import __version__

SERVICE_NAME = "pre-session-briefing"
API_VERSION = "v1"
DEFAULT_MARKET = "us-index-futures"


def _build_live_snapshot(*, market: str, local_timezone: str | None, include_social: bool) -> dict[str, Any]:
    from .live_data import build_live_snapshot

    return build_live_snapshot(
        market=market,
        local_timezone=local_timezone,
        include_social=include_social,
    )


def _build_chart_pack(*, symbols: list[str], timeframe_keys: list[str]) -> dict[str, Any]:
    from .charts import build_chart_pack

    return build_chart_pack(symbols=symbols, timeframe_keys=timeframe_keys)


def _coerce_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def _select_values(values: Any, allowed: list[str], default: list[str]) -> list[str]:
    if not isinstance(values, list):
        return default
    selected = [str(item) for item in values if str(item) in allowed]
    return selected or default


def _normalize_timezone(value: Any) -> str | None:
    if value is None or value == "":
        return None
    timezone_name = str(value)
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise BriefingValidationError(f"Invalid local_timezone: {timezone_name}") from exc
    return timezone_name


def service_metadata() -> dict[str, Any]:
    return {
        "name": SERVICE_NAME,
        "version": __version__,
        "api_version": API_VERSION,
        "default_market": DEFAULT_MARKET,
    }


def service_capabilities() -> dict[str, Any]:
    return {
        "service": service_metadata(),
        "markets": [
            {
                "id": DEFAULT_MARKET,
                "label": "US index futures",
                "notes": "Session logic and event weighting are currently tuned for US index futures.",
            }
        ],
        "options": {
            "include_snapshot": True,
            "include_social": True,
            "include_charts": True,
        },
        "charts": {
            "symbols": list(TRACKED_SYMBOLS.keys()),
            "timeframes": [config.key for config in CHART_CONFIGS],
        },
        "response_fields": [
            "service",
            "request",
            "snapshot",
            "briefing",
            "charts",
        ],
    }


def normalize_live_request(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if payload is not None and not isinstance(payload, dict):
        raise BriefingValidationError("Request body must be a JSON object.")

    raw = payload or {}
    allowed_symbols = list(TRACKED_SYMBOLS.keys())
    allowed_timeframes = [config.key for config in CHART_CONFIGS]
    return {
        "market": str(raw.get("market") or DEFAULT_MARKET),
        "local_timezone": _normalize_timezone(raw.get("local_timezone")),
        "include_snapshot": _coerce_bool(raw.get("include_snapshot"), True),
        "include_social": _coerce_bool(raw.get("include_social"), True),
        "include_charts": _coerce_bool(raw.get("include_charts"), True),
        "chart_symbols": _select_values(raw.get("chart_symbols"), allowed_symbols, allowed_symbols),
        "chart_timeframes": _select_values(raw.get("chart_timeframes"), allowed_timeframes, allowed_timeframes),
    }


def generate_live_response(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    request = normalize_live_request(payload)
    snapshot = _build_live_snapshot(
        market=request["market"],
        local_timezone=request["local_timezone"],
        include_social=request["include_social"],
    )
    briefing = generate_session_brief(snapshot)
    response_warnings = list(snapshot.get("_meta", {}).get("warnings", []))

    response: dict[str, Any] = {
        "service": service_metadata(),
        "request": request,
        "generated_at": utc_now_iso(),
        "briefing": briefing,
        "source_health": snapshot.get("_meta", {}).get("source_health"),
    }
    if request["include_snapshot"]:
        response["snapshot"] = snapshot
    if request["include_charts"]:
        try:
            response["charts"] = _build_chart_pack(
                symbols=request["chart_symbols"],
                timeframe_keys=request["chart_timeframes"],
            )
        except Exception as exc:
            response["charts"] = {}
            response_warnings.append(f"charts: {exc}")
    if response_warnings:
        response["warnings"] = response_warnings
    return response
