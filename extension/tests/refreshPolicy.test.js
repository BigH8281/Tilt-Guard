const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldEmitSnapshotRefresh,
  buildSnapshotRefreshDetails,
} = require("../src/content/refresh-policy.js");

test("emits a periodic refresh for a visible TradingView tab after the refresh interval", () => {
  const result = shouldEmitSnapshotRefresh({
    reason: "heartbeat",
    documentHidden: false,
    lastRefreshEventAt: 0,
    now: 16_000,
    refreshIntervalMs: 15_000,
  });

  assert.equal(result, true);
});

test("emits immediately when the symbol changes even before the periodic refresh interval", () => {
  const result = shouldEmitSnapshotRefresh({
    reason: "mutation",
    documentHidden: false,
    lastRefreshEventAt: 10_000,
    now: 12_000,
    refreshIntervalMs: 15_000,
    symbolChanged: true,
  });

  assert.equal(result, true);
});

test("builds refresh details with symbol and page metadata changes", () => {
  const details = buildSnapshotRefreshDetails({
    reason: "title",
    changedFields: ["generic", "broker"],
    previousSymbol: "EURUSD",
    currentSymbol: "GBPUSD",
    previousPageTitle: "EURUSD - TradingView",
    pageTitle: "GBPUSD - TradingView",
    previousPageUrl: "https://www.tradingview.com/chart/abc/?symbol=EURUSD",
    pageUrl: "https://www.tradingview.com/chart/abc/?symbol=GBPUSD",
    tradingPanelStateChanged: false,
  });

  assert.equal(details.symbol_changed, true);
  assert.equal(details.previous_symbol, "EURUSD");
  assert.equal(details.current_symbol, "GBPUSD");
  assert.equal(details.page_title_changed, true);
  assert.equal(details.page_url_changed, true);
});
