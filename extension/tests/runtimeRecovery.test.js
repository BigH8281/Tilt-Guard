const test = require("node:test");
const assert = require("node:assert/strict");

test("requests a recovery probe when authenticated TradingView monitoring has no fresh snapshot after reload", async () => {
  const { needsRecoveryProbe } = await import("../src/background/runtime-recovery.js");
  const result = needsRecoveryProbe({
    isAuthenticated: true,
    hasCompletedTabScan: true,
    hasTradingViewTab: true,
    lastKnownUpdatedAt: "",
    extensionSessionStatus: "",
    now: 1_000_000,
  });

  assert.equal(result, true);
});

test("requests a recovery probe when the backend session is offline", async () => {
  const { needsRecoveryProbe } = await import("../src/background/runtime-recovery.js");
  const result = needsRecoveryProbe({
    isAuthenticated: true,
    hasCompletedTabScan: true,
    hasTradingViewTab: true,
    lastKnownUpdatedAt: new Date(950_000).toISOString(),
    extensionSessionStatus: "offline",
    now: 1_000_000,
    staleAfterMs: 120_000,
  });

  assert.equal(result, true);
});

test("does not probe when telemetry is already fresh", async () => {
  const { needsRecoveryProbe } = await import("../src/background/runtime-recovery.js");
  const result = needsRecoveryProbe({
    isAuthenticated: true,
    hasCompletedTabScan: true,
    hasTradingViewTab: true,
    lastKnownUpdatedAt: new Date(950_000).toISOString(),
    extensionSessionStatus: "live",
    now: 1_000_000,
    staleAfterMs: 120_000,
  });

  assert.equal(result, false);
});

test("does not probe when auth or TradingView context is missing", async () => {
  const { needsRecoveryProbe } = await import("../src/background/runtime-recovery.js");
  assert.equal(
    needsRecoveryProbe({
      isAuthenticated: false,
      hasCompletedTabScan: true,
      hasTradingViewTab: true,
      lastKnownUpdatedAt: "",
      extensionSessionStatus: "offline",
    }),
    false,
  );

  assert.equal(
    needsRecoveryProbe({
      isAuthenticated: true,
      hasCompletedTabScan: false,
      hasTradingViewTab: true,
      lastKnownUpdatedAt: "",
      extensionSessionStatus: "offline",
    }),
    false,
  );
});
