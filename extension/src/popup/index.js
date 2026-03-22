const apiBaseUrlInput = document.querySelector("#apiBaseUrl");
const authTokenInput = document.querySelector("#authToken");
const saveButton = document.querySelector("#saveButton");
const flushButton = document.querySelector("#flushButton");
const summary = document.querySelector("#summary");
const statusBody = document.querySelector("#statusBody");
const queueBody = document.querySelector("#queueBody");

function formatFlushSummary(payload) {
  const snapshot = payload.status.snapshot;
  const broker = snapshot.broker || {};

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

  return broker.broker_connected
    ? `Connected locally only: ${broker.broker_label || "Unknown broker"}`
    : "TradingView observed locally only, broker not confirmed connected";
}

function renderStatus(payload) {
  if (!payload?.status) {
    summary.textContent = "No TradingView telemetry observed yet.";
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
    `configuredApiBaseUrl: ${payload.settings.apiBaseUrl || "unset"}`,
    `lastAttemptUrl: ${payload.lastAttemptUrl || "never"}`,
    `queueDepth: ${payload.queueDepth}`,
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

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "telemetry:get-status" });
  if (!response?.ok) {
    summary.textContent = "Unable to load extension status.";
    return;
  }

  apiBaseUrlInput.value = response.settings.apiBaseUrl || "";
  authTokenInput.value = response.settings.authToken || "";
  renderStatus(response);
  renderQueue(response);
}

saveButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "telemetry:update-settings",
    payload: {
      apiBaseUrl: apiBaseUrlInput.value.trim(),
      authToken: authTokenInput.value.trim(),
    },
  });
  await refresh();
});

flushButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "telemetry:flush-now" });
  await refresh();
});

void refresh();
