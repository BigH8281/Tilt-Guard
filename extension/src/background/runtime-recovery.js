import { isStaleTimestamp, TELEMETRY_STALE_AFTER_MS } from "./extension-state.js";

export function needsRecoveryProbe({
  isAuthenticated,
  hasCompletedTabScan,
  hasTradingViewTab,
  lastKnownUpdatedAt,
  extensionSessionStatus = "",
  now = Date.now(),
  staleAfterMs = TELEMETRY_STALE_AFTER_MS,
}) {
  if (!isAuthenticated || !hasCompletedTabScan || !hasTradingViewTab) {
    return false;
  }

  if (!lastKnownUpdatedAt) {
    return true;
  }

  if (isStaleTimestamp(lastKnownUpdatedAt, staleAfterMs, now)) {
    return true;
  }

  return extensionSessionStatus === "offline";
}
