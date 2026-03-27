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
    accountManagerRegion:
      '[aria-label="Account manager"], [data-name$="positions-table"], [data-name$="orders-table"], [data-name$="history-table"]',
    brokerSelectorButton: 'button[data-qa-id="broker-selector"], button[aria-label="Select broker dropdown"]',
    // Prefer the visible chart header symbol over page-title heuristics.
    chartHeaderSymbolButton: '[aria-label^="Chart #"] button[aria-label="Change symbol"]',
    chartCanvas: '[aria-label^="Chart #"] canvas',
    chartSurfaceRoot: '.chart-widget, .chart-container, .chart-markup-table',
    chartTradeButtonsContainer: '[data-name="buy-order-button"], [data-name="sell-order-button"]',
    chartBuyOrderButton: '[data-name="buy-order-button"]',
    chartSellOrderButton: '[data-name="sell-order-button"]',
    // The live FXCM page exposes order-entry via `title` in some layouts and `aria-label` in others.
    orderEntryButton: buildButtonSelector(ORDER_ENTRY_LABELS),
    panelOpenButton: buildButtonSelector(PANEL_TOGGLE_LABELS),
    panelMaximizeButton: 'button[aria-label="Maximize panel"]',
    topTradeButton: buildButtonSelector(TOP_TRADE_LABELS),
    chartRegion: '[aria-label^="Chart #"]',
    sideButtons:
      'button[aria-label*="Buy" i], button[title*="Buy" i], button[aria-label*="Sell" i], button[title*="Sell" i]',
    submitButtons:
      'button[aria-label*="Buy" i], button[title*="Buy" i], button[aria-label*="Sell" i], button[title*="Sell" i], button[aria-label*="Place" i], button[title*="Place" i], button[aria-label*="Submit" i], button[title*="Submit" i]',
    cancelButtons:
      'button[aria-label*="Cancel" i], button[title*="Cancel" i], button[aria-label*="Remove" i], button[title*="Remove" i]',
    quantityInputs:
      'input[aria-label*="qty" i], input[aria-label*="quantity" i], input[aria-label*="contracts" i], input[aria-label*="units" i], input[aria-label*="amount" i], input[aria-label*="size" i], input[name*="qty" i], input[name*="quantity" i], input[name*="size" i], input[placeholder*="qty" i], input[placeholder*="quantity" i], input[placeholder*="contracts" i], input[placeholder*="units" i], input[placeholder*="amount" i], input[placeholder*="size" i]',
    priceInputs:
      'input[aria-label*="price" i], input[aria-label*="limit" i], input[aria-label*="stop" i], input[name*="price" i], input[name*="limit" i], input[name*="stop" i], input[placeholder*="price" i], input[placeholder*="limit" i], input[placeholder*="stop" i]',
    orderTypeControls:
      '[role="combobox"], button[aria-haspopup="listbox"], button[aria-label*="order type" i], button[title*="order type" i]',
    positionsTable: 'table[data-name$="positions-table"]',
    positionCloseButtons: 'button[aria-label="Close"], button[title="Close"]',
    chartPositionActionButtons:
      'button[aria-label*="Protect Position" i], button[title*="Protect Position" i], button[aria-label*="Close Position" i], button[title*="Close Position" i], button[aria-label*="Reverse Position" i], button[title*="Reverse Position" i], button[aria-label*="Take Profit" i], button[title*="Take Profit" i], button[aria-label*="Stop Loss" i], button[title*="Stop Loss" i], button[aria-label*="Break-even" i], button[title*="Break-even" i], button[aria-label*="Breakeven" i], button[title*="Breakeven" i]',
    tradingNotificationLogs: 'log, [role="log"]',
    tradingNotificationToastButtons: 'button[data-name^="toast-group-expand-button-"]',
    tradingNotificationToastGroups: '[class*="toastGroup-"], [class*="toastListScroll-"], [class*="toastListInner-"]',
    longPositionToolButton:
      '[data-name="FavoriteToolbarLineToolRiskRewardLong"], button[aria-label="Long position"]',
    shortPositionToolButton:
      '[data-name="FavoriteToolbarLineToolRiskRewardShort"], button[aria-label="Short position"]',
    removeObjectsButton: '[data-name="removeAllDrawingTools"], button[aria-label="Remove objects"]',
    drawingToolbar: '[data-name="drawing-toolbar"]',
    createLimitOrderControl: '[data-name="createLimitOrder"], [title="Create limit order"]',
    planningSettingsButton: 'button[aria-label="Settings"], button[title="Settings"]',
    planningRemoveButton: 'button[aria-label="Remove"], button[title="Remove"]',
    planningMoreButton: 'button[aria-label="More"], button[title="More"]',
    undoCreateLongPositionButton:
      'button[aria-label="Undo create long position"], button[title="Undo create long position"]',
    undoCreateShortPositionButton:
      'button[aria-label="Undo create short position"], button[title="Undo create short position"]',
    undoRemoveLongPositionButton:
      'button[aria-label="Undo remove long position"], button[title="Undo remove long position"]',
    undoRemoveShortPositionButton:
      'button[aria-label="Undo remove short position"], button[title="Undo remove short position"]',
  };

  const FXCM_SIGNATURE = {
    brokerLabel: "FXCM Live",
  };

  const OBSERVER_CONFIG = {
    debounceMs: 400,
    heartbeatMs: 2000,
    snapshotRefreshMs: 15000,
    observationGapMs: 10000,
    footerSearchDepth: 5,
    maxBatchSize: 50,
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

  const TRADE_EVIDENCE_STAGES = {
    INTENT_OBSERVED: "intent_observed",
    EXECUTION_LIKELY: "execution_likely",
    EXECUTION_CONFIRMED: "execution_confirmed",
  };

  function createLogger(scope) {
    function stringifyContext(context) {
      const entries = Object.entries(context || {}).filter(([, value]) => value !== undefined);
      if (!entries.length) {
        return "";
      }

      try {
        return ` ${JSON.stringify(Object.fromEntries(entries))}`;
      } catch {
        return ` ${String(context)}`;
      }
    }

    function log(level, message, context = {}) {
      const method = console[level] || console.log;
      method(`${PREFIX} ${scope}:${message}${stringifyContext(context)}`);
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

  function buildObservationKey({ pageUrl, brokerAdapter = "tradingview_base", tabId = "unknown" }) {
    return `${brokerAdapter}:${tabId}:${pageUrl}`;
  }

  function createEventEnvelope({
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

  global.TiltGuardContent = {
    OBSERVER_CONFIG,
    FXCM_SIGNATURE,
    TELEMETRY_EVENT_TYPES,
    TRADE_EVIDENCE_STAGES,
    TRADINGVIEW_SELECTORS,
    buildObservationKey,
    createEventEnvelope,
    createLogger,
    getTradingViewPageMatch,
  };
})(globalThis);
