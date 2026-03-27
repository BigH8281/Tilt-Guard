function buildButtonSelector(labels) {
  return labels
    .flatMap((label) => [`button[aria-label="${label}"]`, `button[title="${label}"]`])
    .join(", ");
}

const ACCOUNT_MANAGER_LABELS = ["Open Account Manager", "Close Account Manager", "Select broker dropdown"];
const ORDER_ENTRY_LABELS = ["Place an order via Order Panel or DOM"];
const PANEL_TOGGLE_LABELS = ["Open panel", "Collapse panel"];
const TOP_TRADE_LABELS = ["Trade with your broker"];

export const TV_PAGE_RULES = {
  hostPattern: /(^|\.)tradingview\.com$/i,
  chartPathPattern: /^\/chart\/[^/]+\/?$/i,
};

export const TRADINGVIEW_SELECTORS = {
  tradingPanelRoot: '[aria-label="Trading panel"]',
  accountManagerButton: buildButtonSelector(ACCOUNT_MANAGER_LABELS),
  accountManagerRegion:
    '[aria-label="Account manager"], [data-name$="positions-table"], [data-name$="orders-table"], [data-name$="history-table"]',
  brokerSelectorButton: 'button[data-qa-id="broker-selector"], button[aria-label="Select broker dropdown"]',
  chartHeaderSymbolButton: '[aria-label^="Chart #"] button[aria-label="Change symbol"]',
  chartCanvas: '[aria-label^="Chart #"] canvas',
  chartSurfaceRoot: '.chart-widget, .chart-container, .chart-markup-table',
  chartTradeButtonsContainer: '[data-name="buy-order-button"], [data-name="sell-order-button"]',
  chartBuyOrderButton: '[data-name="buy-order-button"]',
  chartSellOrderButton: '[data-name="sell-order-button"]',
  orderEntryButton: buildButtonSelector(ORDER_ENTRY_LABELS),
  panelOpenButton: buildButtonSelector(PANEL_TOGGLE_LABELS),
  panelMaximizeButton: 'button[aria-label="Maximize panel"]',
  topTradeButton: buildButtonSelector(TOP_TRADE_LABELS),
  chartRegion: '[aria-label^="Chart #"]',
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

export const FXCM_SIGNATURE = {
  brokerLabel: "FXCM Live",
  footerControls: [
    "accountManagerButton",
    "orderEntryButton",
    "panelOpenButton",
    "panelMaximizeButton",
  ],
};

export const OBSERVER_CONFIG = {
  debounceMs: 400,
  heartbeatMs: 2000,
  snapshotRefreshMs: 15000,
  observationGapMs: 10000,
  footerSearchDepth: 5,
  maxBatchSize: 50,
};

export function getTradingViewPageMatch(locationLike = window.location) {
  const isTradingViewHost = TV_PAGE_RULES.hostPattern.test(locationLike.hostname);
  const isChartPath = TV_PAGE_RULES.chartPathPattern.test(locationLike.pathname);
  return {
    isTradingViewHost,
    isChartPath,
    isTradingViewChart: isTradingViewHost && isChartPath,
  };
}
