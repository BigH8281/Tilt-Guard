from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


BrokerTelemetryEventType = Literal[
    "extension_connected",
    "extension_disconnected",
    "tradingview_detected",
    "adapter_unmatched",
    "broker_profile_matched",
    "monitoring_activated",
    "monitoring_stale",
    "monitoring_lost",
    "reconnect_succeeded",
    "tradingview_tab_detected",
    "trading_panel_visible",
    "broker_connected",
    "broker_disconnected",
    "broker_label_changed",
    "account_manager_control_visible",
    "order_entry_control_visible",
    "panel_open_control_visible",
    "panel_maximize_control_visible",
    "snapshot_refreshed",
    "observation_gap",
    "trade_ticket_opened",
    "trade_side_selected",
    "trade_order_type_detected",
    "trade_quantity_detected",
    "trade_submit_clicked",
    "trade_order_visible",
    "trade_position_opened",
    "trade_position_changed",
    "trade_position_closed",
    "trade_order_cancelled",
    "trade_execution_unverified",
    "chart_trade_control_visible",
    "chart_trade_buy_clicked",
    "chart_trade_sell_clicked",
    "chart_long_tool_selected",
    "chart_short_tool_selected",
    "chart_position_tool_placed",
    "chart_position_tool_modified",
    "chart_position_tool_removed",
    "chart_trade_execution_unverified",
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


class TradingViewGenericSnapshot(BaseModel):
    is_tradingview_chart: bool
    trading_surface_visible: bool
    trading_panel_visible: bool
    current_symbol: str | None = None
    account_manager_entrypoint_visible: bool
    broker_selector_visible: bool = False
    order_entry_control_visible: bool
    panel_open_control_visible: bool
    panel_maximize_control_visible: bool


class BrokerEnrichmentSnapshot(BaseModel):
    broker_connected: bool = False
    broker_label: str | None = None
    current_account_name: str | None = None
    fxcm_footer_cluster_visible: bool = False
    anchor_summary: BrokerAnchorSummary = Field(default_factory=BrokerAnchorSummary)


class TradeEvidenceSnapshot(BaseModel):
    ticket_visible: bool = False
    order_visible: bool = False
    submit_control_visible: bool = False
    cancel_control_visible: bool = False
    chart_trade_controls_visible: bool = False
    chart_buy_control_visible: bool = False
    chart_sell_control_visible: bool = False
    selected_side: str | None = None
    order_type: str | None = None
    quantity: float | None = None
    price: float | None = None
    position_size: float | None = None
    position_side: str | None = None
    visible_order_summary: str | None = None


class BrokerDomSnapshot(BaseModel):
    generic: TradingViewGenericSnapshot
    broker: BrokerEnrichmentSnapshot = Field(default_factory=BrokerEnrichmentSnapshot)
    trade: TradeEvidenceSnapshot = Field(default_factory=TradeEvidenceSnapshot)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_snapshot(cls, value: Any) -> Any:
        if not isinstance(value, dict) or "generic" in value:
            return value

        return {
            "generic": {
                "is_tradingview_chart": value.get("is_tradingview_chart", False),
                "trading_surface_visible": value.get("trading_surface_visible", False),
                "trading_panel_visible": value.get("trading_panel_visible", False),
                "current_symbol": value.get("current_symbol"),
                "account_manager_entrypoint_visible": value.get("account_manager_control_visible", False),
                "broker_selector_visible": value.get("broker_selector_visible", False),
                "order_entry_control_visible": value.get("order_entry_control_visible", False),
                "panel_open_control_visible": value.get("panel_open_control_visible", False),
                "panel_maximize_control_visible": value.get("panel_maximize_control_visible", False),
            },
            "broker": {
                "broker_connected": value.get("broker_connected", False),
                "broker_label": value.get("broker_label"),
                "current_account_name": value.get("current_account_name"),
                "fxcm_footer_cluster_visible": value.get("fxcm_footer_cluster_visible", False),
                "anchor_summary": value.get("anchor_summary") or {},
            },
            "trade": {
                "ticket_visible": value.get("ticket_visible", False),
                "order_visible": value.get("order_visible", False),
                "submit_control_visible": value.get("submit_control_visible", False),
                "cancel_control_visible": value.get("cancel_control_visible", False),
                "chart_trade_controls_visible": value.get("chart_trade_controls_visible", False),
                "chart_buy_control_visible": value.get("chart_buy_control_visible", False),
                "chart_sell_control_visible": value.get("chart_sell_control_visible", False),
                "selected_side": value.get("selected_side"),
                "order_type": value.get("order_type"),
                "quantity": value.get("quantity"),
                "price": value.get("price"),
                "position_size": value.get("position_size"),
                "position_side": value.get("position_side"),
                "visible_order_summary": value.get("visible_order_summary"),
            },
        }


class BrokerTelemetryEventCreate(BaseModel):
    event_id: str = Field(min_length=36, max_length=36)
    event_type: BrokerTelemetryEventType
    occurred_at: datetime
    source: Literal["extension"] = "extension"
    platform: Literal["tradingview"] = "tradingview"
    broker_adapter: str = Field(default="tradingview_base", min_length=1, max_length=32)
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
    extension_session_key: str | None = None
    trading_session_id: int | None = None
    occurred_at: datetime
    page_url: str
    page_title: str
    snapshot: BrokerDomSnapshot
    details: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class BrokerTelemetryEventListResponse(BaseModel):
    events: list[BrokerTelemetryEventDebugRead]


class BrokerTelemetrySystemEventRead(BaseModel):
    id: int
    event_id: str
    event_type: BrokerTelemetryEventType
    occurred_at: datetime
    level: Literal["info", "warning"]
    message: str
    broker_adapter: str
    broker_profile: str | None = None
    symbol: str | None = None
    details: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class BrokerTelemetrySystemEventListResponse(BaseModel):
    events: list[BrokerTelemetrySystemEventRead]


class BrokerTelemetryEventRead(BaseModel):
    id: int
    event_id: str
    event_type: BrokerTelemetryEventType
    source: str
    platform: str
    broker_adapter: str
    observation_key: str
    extension_session_key: str | None = None
    trading_session_id: int | None = None
    page_url: str
    page_title: str
    occurred_at: datetime
    received_at: datetime
    snapshot: BrokerDomSnapshot
    details: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


BrokerTelemetryLiveStatus = Literal["live", "attention", "offline"]


class BrokerTelemetryLatestRead(BaseModel):
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
    symbol: str | None = None
    account_name: str | None = None
    freshness_seconds: int
    freshness_window_seconds: int
    is_fresh: bool
    status: BrokerTelemetryLiveStatus

    model_config = ConfigDict(from_attributes=True)


TradeEvidenceStage = Literal["intent_observed", "execution_likely", "execution_confirmed"]


class TradeEvidenceRead(BaseModel):
    id: int
    event_id: str
    event_type: BrokerTelemetryEventType
    occurred_at: datetime
    broker_adapter: str
    broker_profile: str | None = None
    symbol: str | None = None
    side: str | None = None
    order_type: str | None = None
    quantity: float | None = None
    price: float | None = None
    confidence: float
    evidence_stage: TradeEvidenceStage
    raw_signal_summary: str
    extension_session_key: str | None = None
    trading_session_id: int | None = None
    page_url: str
    page_title: str
    details: dict[str, Any] | None = None


class TradeEvidenceListResponse(BaseModel):
    events: list[TradeEvidenceRead]


class BrokerTelemetryLatestResponse(BaseModel):
    telemetry: BrokerTelemetryLatestRead | None = None
