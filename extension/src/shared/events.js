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
  OBSERVATION_GAP: "observation_gap",
};

export function buildObservationKey({ pageUrl, brokerAdapter = "fxcm", tabId = "unknown" }) {
  return `${brokerAdapter}:${tabId}:${pageUrl}`;
}

export function createEventEnvelope({
  eventType,
  snapshot,
  details = null,
  pageTitle,
  pageUrl,
  brokerAdapter = "fxcm",
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
