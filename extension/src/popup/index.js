const summary = document.querySelector("#summary");
const authStateValue = document.querySelector("#authStateValue");
const authUserValue = document.querySelector("#authUserValue");
const authSyncedAtValue = document.querySelector("#authSyncedAtValue");
const extensionStateValue = document.querySelector("#extensionStateValue");
const monitoringStateValue = document.querySelector("#monitoringStateValue");
const sessionStatusValue = document.querySelector("#sessionStatusValue");
const tradingViewValue = document.querySelector("#tradingViewValue");
const brokerValue = document.querySelector("#brokerValue");
const adapterValue = document.querySelector("#adapterValue");
const freshnessValue = document.querySelector("#freshnessValue");
const warningValue = document.querySelector("#warningValue");
const statusBody = document.querySelector("#statusBody");
const connectButton = document.querySelector("#connectButton");
const disconnectButton = document.querySelector("#disconnectButton");
const refreshButton = document.querySelector("#refreshButton");
const flushButton = document.querySelector("#flushButton");

function formatTimestamp(value) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatStatusSummary(payload) {
  const settings = payload.settings;
  const extensionState = settings.extensionState || "unknown";
  const monitoringState = settings.monitoringState || "inactive";

  if (!settings.authToken) {
    return "Sign in from the web app to connect the extension.";
  }

  if (extensionState === "tradingview_not_detected") {
    return "Tilt-Guard is connected. Open a TradingView chart to start monitoring.";
  }

  if (extensionState === "adapter_unmatched") {
    return "TradingView is detected. Monitoring is active with the base adapter.";
  }

  if (monitoringState === "active") {
    return "Monitoring is active and ready for live TradingView testing.";
  }

  if (monitoringState === "stale") {
    return "Telemetry is stale. Focus the TradingView chart to refresh monitoring.";
  }

  return "Tilt-Guard is connected and scanning the browser session.";
}

async function loadStatus() {
  return chrome.runtime.sendMessage({ type: "telemetry:get-status" });
}

function renderStatus(payload) {
  const settings = payload.settings;
  const latestStatus = payload.status;
  const snapshot = latestStatus?.snapshot;
  const adapter = latestStatus?.adapter;

  summary.textContent = formatStatusSummary(payload);
  authStateValue.textContent = settings.authToken ? "Signed in" : "Signed out";
  authUserValue.textContent = settings.authUserEmail || "Unknown";
  authSyncedAtValue.textContent = formatTimestamp(settings.authSyncedAt);
  extensionStateValue.textContent = settings.extensionState || "unknown";
  monitoringStateValue.textContent = settings.monitoringState || "inactive";
  sessionStatusValue.textContent = settings.extensionSessionStatus || "offline";
  tradingViewValue.textContent =
    settings.tradingViewTabCount > 0 ? `${settings.tradingViewTabCount} chart tab(s)` : "Not detected";
  brokerValue.textContent = settings.detectedBrokerProfile || "Unknown";
  adapterValue.textContent = `${settings.detectedBrokerAdapter || "tradingview_base"} (${Math.round(
    (settings.detectedAdapterConfidence || 0) * 100,
  )}%)`;
  freshnessValue.textContent = latestStatus?.updatedAt ? formatTimestamp(latestStatus.updatedAt) : "No telemetry yet";
  warningValue.textContent = settings.currentWarning || "None";

  disconnectButton.disabled = !settings.authToken;

  statusBody.textContent = JSON.stringify(
    {
      extensionState: settings.extensionState,
      monitoringState: settings.monitoringState,
      extensionSessionStatus: settings.extensionSessionStatus,
      detectedBrokerAdapter: settings.detectedBrokerAdapter,
      detectedBrokerProfile: settings.detectedBrokerProfile,
      detectedAdapterConfidence: settings.detectedAdapterConfidence,
      detectedAdapterReliability: settings.detectedAdapterReliability,
      latestPageUrl: latestStatus?.pageUrl || null,
      latestPageTitle: latestStatus?.pageTitle || null,
      warning: settings.currentWarning || null,
      lastFlushOutcome: payload.lastFlushOutcome || null,
      queueDepth: payload.queueDepth,
      adapter,
      snapshot,
    },
    null,
    2,
  );
}

async function refresh() {
  const response = await loadStatus();
  if (!response?.ok) {
    summary.textContent = "Unable to load extension status.";
    return;
  }
  renderStatus(response);
}

connectButton.addEventListener("click", async () => {
  const response = await loadStatus();
  const appBaseUrl = response?.settings?.appBaseUrl;
  if (!appBaseUrl) {
    summary.textContent = "Journal URL is not configured for this mode.";
    return;
  }

  const connectUrl = new URL("/extension/connect", appBaseUrl);
  connectUrl.searchParams.set("extensionId", chrome.runtime.id);
  connectUrl.searchParams.set("mode", response.settings.mode || "");
  await chrome.tabs.create({ url: connectUrl.toString() });
});

disconnectButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "extension:disconnect-auth" });
  await refresh();
});

refreshButton.addEventListener("click", async () => {
  await refresh();
});

flushButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "telemetry:flush-now" });
  await refresh();
});

void refresh();
