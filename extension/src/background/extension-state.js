export const EXTENSION_STATE = {
  SIGNED_OUT: "signed_out",
  APP_AUTHENTICATED: "app_authenticated",
  TRADINGVIEW_NOT_DETECTED: "tradingview_not_detected",
  TRADINGVIEW_DETECTED: "tradingview_detected",
  ADAPTER_UNMATCHED: "adapter_unmatched",
  BROKER_DETECTED: "broker_detected",
  MONITORING_ACTIVE: "monitoring_active",
  MONITORING_STALE: "monitoring_stale",
  ERROR: "error",
};

export const MONITORING_STATE = {
  INACTIVE: "inactive",
  ACTIVE: "active",
  STALE: "stale",
  ERROR: "error",
};

export const TELEMETRY_STALE_AFTER_MS = 120_000;

export function isStaleTimestamp(value, thresholdMs = TELEMETRY_STALE_AFTER_MS, now = Date.now()) {
  if (!value) {
    return true;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return now - parsed > thresholdMs;
}

export function deriveExtensionRuntime(context) {
  if (context.lastError) {
    return {
      extensionState: EXTENSION_STATE.ERROR,
      monitoringState: MONITORING_STATE.ERROR,
      warningMessage: context.lastError,
    };
  }

  if (!context.isAuthenticated) {
    return {
      extensionState: EXTENSION_STATE.SIGNED_OUT,
      monitoringState: MONITORING_STATE.INACTIVE,
      warningMessage: "",
    };
  }

  if (!context.hasCompletedTabScan) {
    return {
      extensionState: EXTENSION_STATE.APP_AUTHENTICATED,
      monitoringState: MONITORING_STATE.INACTIVE,
      warningMessage: "Checking for TradingView tabs.",
    };
  }

  if (!context.hasTradingViewTab) {
    return {
      extensionState: EXTENSION_STATE.TRADINGVIEW_NOT_DETECTED,
      monitoringState: MONITORING_STATE.INACTIVE,
      warningMessage: "Open a TradingView chart to activate monitoring.",
    };
  }

  if (!context.hasObservedTradingView) {
    return {
      extensionState: EXTENSION_STATE.TRADINGVIEW_DETECTED,
      monitoringState: MONITORING_STATE.INACTIVE,
      warningMessage: "TradingView detected. Waiting for chart telemetry.",
    };
  }

  if (context.isTelemetryStale) {
    return {
      extensionState: EXTENSION_STATE.MONITORING_STALE,
      monitoringState: MONITORING_STATE.STALE,
      warningMessage: "TradingView telemetry is stale. Refresh the chart tab if needed.",
    };
  }

  if (!context.hasMatchedBrokerAdapter) {
    return {
      extensionState: EXTENSION_STATE.ADAPTER_UNMATCHED,
      monitoringState: MONITORING_STATE.ACTIVE,
      warningMessage: "TradingView is being monitored, but the broker adapter is still generic.",
    };
  }

  if (!context.isTradingSurfaceVisible) {
    return {
      extensionState: EXTENSION_STATE.BROKER_DETECTED,
      monitoringState: MONITORING_STATE.INACTIVE,
      warningMessage: "Broker profile detected. Open the TradingView trading panel to deepen monitoring.",
    };
  }

  return {
    extensionState: EXTENSION_STATE.MONITORING_ACTIVE,
    monitoringState: MONITORING_STATE.ACTIVE,
    warningMessage: "",
  };
}
