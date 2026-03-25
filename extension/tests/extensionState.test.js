const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function loadModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../src/background/extension-state.js")).href);
}

test("returns signed_out when auth is missing", async () => {
  const { deriveExtensionRuntime } = await loadModule();
  const result = deriveExtensionRuntime({
    isAuthenticated: false,
    hasCompletedTabScan: false,
    hasTradingViewTab: false,
    hasObservedTradingView: false,
    isTradingSurfaceVisible: false,
    hasMatchedBrokerAdapter: false,
    isTelemetryStale: false,
    lastError: "",
  });

  assert.equal(result.extensionState, "signed_out");
  assert.equal(result.monitoringState, "inactive");
});

test("returns adapter_unmatched for fresh TradingView telemetry without broker match", async () => {
  const { deriveExtensionRuntime } = await loadModule();
  const result = deriveExtensionRuntime({
    isAuthenticated: true,
    hasCompletedTabScan: true,
    hasTradingViewTab: true,
    hasObservedTradingView: true,
    isTradingSurfaceVisible: true,
    hasMatchedBrokerAdapter: false,
    isTelemetryStale: false,
    lastError: "",
  });

  assert.equal(result.extensionState, "adapter_unmatched");
  assert.equal(result.monitoringState, "active");
});

test("returns monitoring_active when broker adapter is matched on a fresh trading surface", async () => {
  const { deriveExtensionRuntime } = await loadModule();
  const result = deriveExtensionRuntime({
    isAuthenticated: true,
    hasCompletedTabScan: true,
    hasTradingViewTab: true,
    hasObservedTradingView: true,
    isTradingSurfaceVisible: true,
    hasMatchedBrokerAdapter: true,
    isTelemetryStale: false,
    lastError: "",
  });

  assert.equal(result.extensionState, "monitoring_active");
  assert.equal(result.monitoringState, "active");
});
