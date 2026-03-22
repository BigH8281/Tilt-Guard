(function attachTiltGuardContentRuntime(global) {
  const PREFIX = "[tilt-guard]";

  function buildButtonSelector(labels) {
    return labels
      .flatMap((label) => [`button[aria-label="${label}"]`, `button[title="${label}"]`])
      .join(", ");
  }

  const TV_PAGE_RULES = {
    hostPattern: /(^|\.)tradingview\.com$/i,
    chartPathPattern: /^\/chart\/[^/]+\/?$/i,
  };

  const ACCOUNT_MANAGER_LABELS = ["Open Account Manager", "Close Account Manager", "Select broker dropdown"];
  const ORDER_ENTRY_LABELS = ["Place an order via Order Panel or DOM"];
  const PANEL_TOGGLE_LABELS = ["Open panel", "Collapse panel"];
  const TOP_TRADE_LABELS = ["Trade with your broker"];

  const TRADINGVIEW_SELECTORS = {
    tradingPanelRoot: '[aria-label="Trading panel"]',
    // TradingView remounts and relabels these controls as the panel expands/collapses.
    accountManagerButton: buildButtonSelector(ACCOUNT_MANAGER_LABELS),
    accountManagerRegion: '[aria-label="Account manager"]',
    brokerSelectorButton: 'button[data-qa-id="broker-selector"], button[aria-label="Select broker dropdown"]',
    // Prefer the visible chart header symbol over page-title heuristics.
    chartHeaderSymbolButton: '[aria-label^="Chart #"] button[aria-label="Change symbol"]',
    // The live FXCM page exposes order-entry via `title` in some layouts and `aria-label` in others.
    orderEntryButton: buildButtonSelector(ORDER_ENTRY_LABELS),
    panelOpenButton: buildButtonSelector(PANEL_TOGGLE_LABELS),
    panelMaximizeButton: 'button[aria-label="Maximize panel"]',
    topTradeButton: buildButtonSelector(TOP_TRADE_LABELS),
    chartRegion: '[aria-label^="Chart #"]',
  };

  const FXCM_SIGNATURE = {
    brokerLabel: "FXCM Live",
  };

  const OBSERVER_CONFIG = {
    debounceMs: 750,
    heartbeatMs: 2000,
    observationGapMs: 10000,
    footerSearchDepth: 5,
  };

  const TELEMETRY_EVENT_TYPES = {
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

  function createLogger(scope) {
    function log(level, message, context = {}) {
      const payload = {
        scope,
        message,
        ...context,
      };
      const method = console[level] || console.log;
      method(PREFIX, payload);
    }

    return {
      debug(message, context) {
        log("debug", message, context);
      },
      info(message, context) {
        log("info", message, context);
      },
      warn(message, context) {
        log("warn", message, context);
      },
      error(message, context) {
        log("error", message, context);
      },
    };
  }

  function getTradingViewPageMatch(locationLike = window.location) {
    const isTradingViewHost = TV_PAGE_RULES.hostPattern.test(locationLike.hostname);
    const isChartPath = TV_PAGE_RULES.chartPathPattern.test(locationLike.pathname);
    return {
      isTradingViewHost,
      isChartPath,
      isTradingViewChart: isTradingViewHost && isChartPath,
    };
  }

  function buildObservationKey({ pageUrl, brokerAdapter = "fxcm", tabId = "unknown" }) {
    return `${brokerAdapter}:${tabId}:${pageUrl}`;
  }

  function createEventEnvelope({
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

  global.TiltGuardContent = {
    OBSERVER_CONFIG,
    FXCM_SIGNATURE,
    TELEMETRY_EVENT_TYPES,
    TRADINGVIEW_SELECTORS,
    buildObservationKey,
    createEventEnvelope,
    createLogger,
    getTradingViewPageMatch,
  };
})(globalThis);
