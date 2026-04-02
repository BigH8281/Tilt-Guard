from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, field_validator


class PreSessionBriefingRequest(BaseModel):
    market: Literal["us-index-futures"] = "us-index-futures"
    local_timezone: str | None = None
    include_snapshot: bool = True
    include_social: bool = True
    include_charts: bool = True
    chart_symbols: list[str] | None = None
    chart_timeframes: list[str] | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("local_timezone")
    @classmethod
    def validate_local_timezone(cls, value: str | None) -> str | None:
        if value in {None, ""}:
            return None

        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Invalid local_timezone: {value}") from exc

        return value


class PreSessionBriefingResponse(BaseModel):
    service: dict[str, Any]
    request: dict[str, Any]
    generated_at: str
    briefing: dict[str, Any]
    storage: dict[str, Any] | None = None
    source_health: dict[str, Any] | None = None
    warnings: list[str] | None = None
    snapshot: dict[str, Any] | None = None
    charts: dict[str, Any] | None = None


class PreSessionBriefingCapabilitiesResponse(BaseModel):
    service: dict[str, Any]
    markets: list[dict[str, Any]]
    options: dict[str, Any]
    charts: dict[str, Any]
    response_fields: list[str]
