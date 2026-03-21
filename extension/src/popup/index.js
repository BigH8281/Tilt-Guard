const apiBaseUrlInput = document.querySelector("#apiBaseUrl");
const authTokenInput = document.querySelector("#authToken");
const saveButton = document.querySelector("#saveButton");
const flushButton = document.querySelector("#flushButton");
const summary = document.querySelector("#summary");
const statusBody = document.querySelector("#statusBody");
const queueBody = document.querySelector("#queueBody");

function renderStatus(payload) {
  if (!payload?.status) {
    summary.textContent = "No TradingView telemetry observed yet.";
    statusBody.textContent = "Open a TradingView chart page with the content script active.";
    return;
  }

  const snapshot = payload.status.snapshot;
  summary.textContent = snapshot.broker_connected
    ? `Connected: ${snapshot.broker_label || "Unknown broker"}`
    : "TradingView observed, broker not confirmed connected";

  statusBody.textContent = JSON.stringify(
    {
      pageTitle: payload.status.pageTitle,
      pageUrl: payload.status.pageUrl,
      updatedAt: payload.status.updatedAt,
      snapshot,
    },
    null,
    2,
  );
}

function renderQueue(payload) {
  const lines = [
    `queueDepth: ${payload.queueDepth}`,
    `lastFlushAt: ${payload.lastFlushAt || "never"}`,
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
