const modeValue = document.querySelector("#modeValue");
const apiBaseUrlValue = document.querySelector("#apiBaseUrlValue");
const appBaseUrlValue = document.querySelector("#appBaseUrlValue");
const authStateValue = document.querySelector("#authStateValue");
const authUserValue = document.querySelector("#authUserValue");
const authSyncedAtValue = document.querySelector("#authSyncedAtValue");
const connectButton = document.querySelector("#connectButton");
const disconnectButton = document.querySelector("#disconnectButton");
const flushButton = document.querySelector("#flushButton");
const summary = document.querySelector("#summary");
const statusBody = document.querySelector("#statusBody");
const queueBody = document.querySelector("#queueBody");

function formatFlushSummary(payload) {
  const snapshot = payload.status?.snapshot;
  const broker = snapshot?.broker || {};

  if (payload.lastFlushOutcome === "failed") {
    return broker.broker_connected
      ? `Observing ${broker.broker_label || "broker"} locally, but backend flush failed`
      : "Observing TradingView locally, but backend flush failed";
  }

  if (payload.lastFlushOutcome === "attempted") {
    return broker.broker_connected
      ? `Observing ${broker.broker_label || "broker"} locally, flush in progress`
      : "Observing TradingView locally, flush in progress";
  }

  if (payload.lastSuccessAt) {
    return broker.broker_connected
      ? `Observed locally and synced: ${broker.broker_label || "Unknown broker"}`
      : "TradingView observed locally and synced, broker not confirmed connected";
  }

  if (payload.queueDepth > 0) {
    return broker.broker_connected
      ? `Observing ${broker.broker_label || "broker"} locally only, waiting to sync`
      : "Observing TradingView locally only, waiting to sync";
  }

  return payload.settings.authToken
    ? "Journal connected. Open a TradingView chart to start syncing."
    : "Connect the journal to enable backend sync.";
}

function renderStatus(payload) {
  if (!payload?.status) {
    summary.textContent = formatFlushSummary(payload);
    statusBody.textContent = "Open a TradingView chart page with the content script active.";
    return;
  }

  const snapshot = payload.status.snapshot;
  summary.textContent = formatFlushSummary(payload);

  statusBody.textContent = JSON.stringify(
    {
      pageTitle: payload.status.pageTitle,
      pageUrl: payload.status.pageUrl,
      updatedAt: payload.status.updatedAt,
      configuredApiBaseUrl: payload.settings.apiBaseUrl || null,
      configuredAppBaseUrl: payload.settings.appBaseUrl || null,
      lastAttemptUrl: payload.lastAttemptUrl,
      lastFlushOutcome: payload.lastFlushOutcome || "never_attempted",
      lastAttemptAt: payload.lastAttemptAt,
      lastSuccessAt: payload.lastSuccessAt,
      lastFlushStatusCode: payload.lastFlushStatusCode,
      lastFlushTrigger: payload.lastFlushTrigger,
      lastFlushBatchSize: payload.lastFlushBatchSize,
      lastError: payload.lastError || null,
      snapshot,
    },
    null,
    2,
  );
}

function renderQueue(payload) {
  const lines = [
    `mode: ${payload.settings.mode || "unknown"}`,
    `configuredApiBaseUrl: ${payload.settings.apiBaseUrl || "unset"}`,
    `configuredAppBaseUrl: ${payload.settings.appBaseUrl || "unset"}`,
    `queueDepth: ${payload.queueDepth}`,
    `lastAttemptUrl: ${payload.lastAttemptUrl || "never"}`,
    `lastFlushOutcome: ${payload.lastFlushOutcome || "never_attempted"}`,
    `lastAttemptAt: ${payload.lastAttemptAt || "never"}`,
    `lastSuccessAt: ${payload.lastSuccessAt || "never"}`,
    `lastFlushStatusCode: ${payload.lastFlushStatusCode ?? "none"}`,
    `lastFlushTrigger: ${payload.lastFlushTrigger || "none"}`,
    `lastFlushBatchSize: ${payload.lastFlushBatchSize ?? 0}`,
    `lastError: ${payload.lastError || "none"}`,
  ];
  queueBody.textContent = lines.join("\n");
}

function renderConnection(payload) {
  modeValue.textContent = payload.settings.mode || "Unknown";
  apiBaseUrlValue.textContent = payload.settings.apiBaseUrl || "unset";
  appBaseUrlValue.textContent = payload.settings.appBaseUrl || "unset";
  authStateValue.textContent = payload.settings.authToken ? "Connected" : "Not connected";
  authUserValue.textContent = payload.settings.authUserEmail || "Unknown";
  authSyncedAtValue.textContent = payload.settings.authSyncedAt || "Never";
  disconnectButton.disabled = !payload.settings.authToken;
}

async function loadStatus() {
  return chrome.runtime.sendMessage({ type: "telemetry:get-status" });
}

async function refresh() {
  const response = await loadStatus();
  if (!response?.ok) {
    summary.textContent = "Unable to load extension status.";
    return;
  }

  renderConnection(response);
  renderStatus(response);
  renderQueue(response);
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
  await chrome.storage.local.set({
    authToken: "",
    authUserEmail: "",
    authSyncedAt: "",
  });
  await refresh();
});

flushButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "telemetry:flush-now" });
  await refresh();
});

void refresh();
