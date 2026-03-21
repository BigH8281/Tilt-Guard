from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


BrokerTelemetryEventType = Literal[
    "tradingview_tab_detected",
    "trading_panel_visible",
    "broker_connected",
    "broker_disconnected",
    "broker_label_changed",
    "account_manager_control_visible",
    "order_entry_control_visible",
    "panel_open_control_visible",
    "panel_maximize_control_visible",
    "observation_gap",
]


class BrokerAnchorSummary(BaseModel):
    trading_panel_root: bool = False
    footer_cluster_visible: bool = False
    account_manager_control: bool = False
    order_entry_control: bool = False
    panel_open_control: bool = False
    panel_maximize_control: bool = False
    top_trade_control: bool = False
    broker_label_text: bool = False


class BrokerDomSnapshot(BaseModel):
    is_tradingview_chart: bool
    trading_surface_visible: bool
    trading_panel_visible: bool
    broker_connected: bool
    broker_label: str | None = None
    account_manager_control_visible: bool
    order_entry_control_visible: bool
    panel_open_control_visible: bool
    panel_maximize_control_visible: bool
    fxcm_footer_cluster_visible: bool
    anchor_summary: BrokerAnchorSummary


class BrokerTelemetryEventCreate(BaseModel):
    event_id: str = Field(min_length=36, max_length=36)
    event_type: BrokerTelemetryEventType
    occurred_at: datetime
    source: Literal["extension"] = "extension"
    platform: Literal["tradingview"] = "tradingview"
    broker_adapter: str = Field(default="fxcm", min_length=1, max_length=32)
    observation_key: str = Field(min_length=1, max_length=255)
    page_url: str = Field(min_length=1)
    page_title: str = Field(min_length=1)
    tab_id: int | None = None
    snapshot: BrokerDomSnapshot
    details: dict[str, Any] | None = None


class BrokerTelemetryBatchIngestRequest(BaseModel):
    events: list[BrokerTelemetryEventCreate] = Field(min_length=1, max_length=100)


class BrokerTelemetryIngestResult(BaseModel):
    event_id: str
    status: Literal["inserted", "duplicate"]


class BrokerTelemetryBatchIngestResponse(BaseModel):
    accepted: int
    results: list[BrokerTelemetryIngestResult]


class BrokerTelemetryEventDebugRead(BaseModel):
    id: int
    event_id: str
    event_type: BrokerTelemetryEventType
    broker_adapter: str
    observation_key: str
    occurred_at: datetime
    page_url: str
    page_title: str
    snapshot: BrokerDomSnapshot
    details: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class BrokerTelemetryEventListResponse(BaseModel):
    events: list[BrokerTelemetryEventDebugRead]


class BrokerTelemetryEventRead(BaseModel):
    id: int
    event_id: str
    event_type: BrokerTelemetryEventType
    source: str
    platform: str
    broker_adapter: str
    observation_key: str
    page_url: str
    page_title: str
    occurred_at: datetime
    received_at: datetime
    snapshot: BrokerDomSnapshot
    details: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)
