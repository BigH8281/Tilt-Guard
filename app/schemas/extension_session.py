from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ExtensionState = Literal[
    "signed_out",
    "app_authenticated",
    "tradingview_not_detected",
    "tradingview_detected",
    "adapter_unmatched",
    "broker_detected",
    "monitoring_active",
    "monitoring_stale",
    "error",
]

ExtensionMonitoringState = Literal["inactive", "active", "stale", "error"]
ExtensionSessionStatus = Literal["live", "attention", "offline"]


class ExtensionSessionUpsertRequest(BaseModel):
    extension_id: str = Field(min_length=1, max_length=64)
    extension_version: str | None = Field(default=None, max_length=32)
    platform: Literal["tradingview"] = "tradingview"
    extension_state: ExtensionState
    monitoring_state: ExtensionMonitoringState
    tradingview_detected: bool = False
    broker_adapter: str | None = Field(default=None, max_length=64)
    broker_profile: str | None = Field(default=None, max_length=128)
    adapter_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    adapter_reliability: str | None = Field(default=None, max_length=32)
    warning_message: str | None = None
    current_tab_url: str | None = None
    current_tab_title: str | None = None
    status_payload: dict[str, Any] | None = None


class ExtensionSessionDisconnectRequest(BaseModel):
    extension_id: str = Field(min_length=1, max_length=64)


class ExtensionSessionRead(BaseModel):
    id: int
    session_key: str
    extension_id: str
    extension_version: str | None = None
    platform: str
    extension_state: ExtensionState
    monitoring_state: ExtensionMonitoringState
    tradingview_detected: bool
    broker_adapter: str | None = None
    broker_profile: str | None = None
    adapter_confidence: float
    adapter_reliability: str | None = None
    warning_message: str | None = None
    current_tab_url: str | None = None
    current_tab_title: str | None = None
    status_payload: dict[str, Any] | None = None
    connected_at: datetime
    last_heartbeat_at: datetime
    disconnected_at: datetime | None = None
    freshness_seconds: int
    freshness_window_seconds: int
    status: ExtensionSessionStatus

    model_config = ConfigDict(from_attributes=True)


class ExtensionSessionUpsertResponse(BaseModel):
    session: ExtensionSessionRead


class ExtensionSessionStatusResponse(BaseModel):
    session: ExtensionSessionRead | None = None
