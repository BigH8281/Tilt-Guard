const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveBrokerSignature } = require("../src/shared/brokerSignature.js");

test("marks FXCM as connected when the live footer signals are split across nearby controls", () => {
  const result = resolveBrokerSignature({
    hasBrokerLabel: true,
    hasAccountManager: true,
    hasOrderEntry: true,
    hasTopTradeControl: false,
    hasPanelOpenControl: true,
    hasPanelMaximizeControl: true,
    hasTradingPanelRoot: true,
    hasFooterCluster: false,
  });

  assert.equal(result.brokerConnected, true);
  assert.equal(result.footerClusterVisible, true);
  assert.equal(result.brokerSignalCount, 5);
});

test("does not mark FXCM as connected when the broker label is missing", () => {
  const result = resolveBrokerSignature({
    hasBrokerLabel: false,
    hasAccountManager: true,
    hasOrderEntry: true,
    hasTopTradeControl: true,
    hasPanelOpenControl: true,
    hasPanelMaximizeControl: true,
    hasTradingPanelRoot: true,
    hasFooterCluster: true,
  });

  assert.equal(result.brokerConnected, false);
});
