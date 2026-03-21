export const TV_PAGE_RULES = {
  hostPattern: /(^|\.)tradingview\.com$/i,
  chartPathPattern: /^\/chart\/[^/]+\/?$/i,
};

export const TRADINGVIEW_SELECTORS = {
  tradingPanelRoot: '[aria-label="Trading panel"]',
  accountManagerButton: 'button[aria-label="Open Account Manager"]',
  orderEntryButton: 'button[aria-label="Place an order via Order Panel or DOM"]',
  panelOpenButton: 'button[aria-label="Open panel"]',
  panelMaximizeButton: 'button[aria-label="Maximize panel"]',
  topTradeButton: 'button[aria-label="Trade with your broker"]',
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
  debounceMs: 750,
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
