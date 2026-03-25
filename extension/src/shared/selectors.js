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
  accountManagerRegion: '[aria-label="Account manager"]',
  brokerSelectorButton: 'button[data-qa-id="broker-selector"], button[aria-label="Select broker dropdown"]',
  chartHeaderSymbolButton: '[aria-label^="Chart #"] button[aria-label="Change symbol"]',
  orderEntryButton: buildButtonSelector(ORDER_ENTRY_LABELS),
  panelOpenButton: buildButtonSelector(PANEL_TOGGLE_LABELS),
  panelMaximizeButton: 'button[aria-label="Maximize panel"]',
  topTradeButton: buildButtonSelector(TOP_TRADE_LABELS),
  chartRegion: '[aria-label^="Chart #"]',
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
