export const TELEMETRY_EVENT_TYPES = {
  TRADINGVIEW_TAB_DETECTED: "tradingview_tab_detected",
  TRADING_PANEL_VISIBLE: "trading_panel_visible",
  BROKER_CONNECTED: "broker_connected",
  BROKER_DISCONNECTED: "broker_disconnected",
  BROKER_LABEL_CHANGED: "broker_label_changed",
  ACCOUNT_MANAGER_CONTROL_VISIBLE: "account_manager_control_visible",
  ORDER_ENTRY_CONTROL_VISIBLE: "order_entry_control_visible",
  PANEL_OPEN_CONTROL_VISIBLE: "panel_open_control_visible",
  PANEL_MAXIMIZE_CONTROL_VISIBLE: "panel_maximize_control_visible",
  SNAPSHOT_REFRESHED: "snapshot_refreshed",
  OBSERVATION_GAP: "observation_gap",
  TRADE_TICKET_OPENED: "trade_ticket_opened",
  TRADE_SIDE_SELECTED: "trade_side_selected",
  TRADE_ORDER_TYPE_DETECTED: "trade_order_type_detected",
  TRADE_QUANTITY_DETECTED: "trade_quantity_detected",
  TRADE_SUBMIT_CLICKED: "trade_submit_clicked",
  TRADE_ORDER_VISIBLE: "trade_order_visible",
  TRADE_POSITION_OPENED: "trade_position_opened",
  TRADE_POSITION_CHANGED: "trade_position_changed",
  TRADE_POSITION_CLOSED: "trade_position_closed",
  TRADE_ORDER_CANCELLED: "trade_order_cancelled",
  TRADE_EXECUTION_UNVERIFIED: "trade_execution_unverified",
  CHART_TRADE_CONTROL_VISIBLE: "chart_trade_control_visible",
  CHART_TRADE_BUY_CLICKED: "chart_trade_buy_clicked",
  CHART_TRADE_SELL_CLICKED: "chart_trade_sell_clicked",
  CHART_LONG_TOOL_SELECTED: "chart_long_tool_selected",
  CHART_SHORT_TOOL_SELECTED: "chart_short_tool_selected",
  CHART_POSITION_TOOL_PLACED: "chart_position_tool_placed",
  CHART_POSITION_TOOL_MODIFIED: "chart_position_tool_modified",
  CHART_POSITION_TOOL_REMOVED: "chart_position_tool_removed",
  CHART_TRADE_EXECUTION_UNVERIFIED: "chart_trade_execution_unverified",
};

export const TRADE_EVIDENCE_STAGES = {
  INTENT_OBSERVED: "intent_observed",
  EXECUTION_LIKELY: "execution_likely",
  EXECUTION_CONFIRMED: "execution_confirmed",
};

export function buildObservationKey({ pageUrl, brokerAdapter = "tradingview_base", tabId = "unknown" }) {
  return `${brokerAdapter}:${tabId}:${pageUrl}`;
}

export function createEventEnvelope({
  eventType,
  snapshot,
  details = null,
  pageTitle,
  pageUrl,
  brokerAdapter = "tradingview_base",
  tabId = null,
}) {
  return {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    source: "extension",
    platform: "tradingview",
    broker_adapter: brokerAdapter,
    observation_key: buildObservationKey({ pageUrl, brokerAdapter, tabId }),
    page_url: pageUrl,
    page_title: pageTitle,
    tab_id: tabId,
    snapshot,
    details,
  };
}
