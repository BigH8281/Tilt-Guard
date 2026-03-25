import { TELEMETRY_STALE_AFTER_MS, deriveExtensionRuntime } from "./extension-state.js";
import { createLogger } from "../shared/log.js";
import { EXTENSION_CONFIG } from "../shared/extension-config.js";
import { OBSERVER_CONFIG } from "../shared/selectors.js";
import { DEFAULT_SETTINGS, STORAGE_KEYS, getSettings, getStorage, setStorage } from "../shared/storage.js";

const logger = createLogger("background");
const FLUSH_ALARM = "telemetry-flush";
const HEARTBEAT_ALARM = "extension-session-heartbeat";
const TRADINGVIEW_URL_PATTERN = "https://www.tradingview.com/chart/*";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

function buildIngestUrl(apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/$/, "")}/broker-telemetry/ingest`;
}

function buildExtensionSessionUrl(apiBaseUrl, path) {
  return `${apiBaseUrl.replace(/\/$/, "")}/extension-sessions/${path}`;
}

async function getQueue() {
  const stored = await getStorage([STORAGE_KEYS.telemetryQueue]);
  return stored[STORAGE_KEYS.telemetryQueue] || [];
}

async function setQueue(queue) {
  await setStorage({ [STORAGE_KEYS.telemetryQueue]: queue });
}

async function appendEvents(events) {
  const queue = await getQueue();
  const nextQueue = [...queue, ...events];
  await setQueue(nextQueue);
  return nextQueue;
}

async function setFlushState(partialState) {
  await setStorage(partialState);
}

function normaliseOrigin(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedExternalOrigins() {
  return new Set(
    [DEFAULT_SETTINGS.appBaseUrl, ...(EXTENSION_CONFIG.allowedExternalOrigins || [])]
      .map((value) => normaliseOrigin(value))
      .filter(Boolean),
  );
}

function isTrustedExternalSender(sender) {
  const allowedOrigins = getAllowedExternalOrigins();
  const senderOrigin = normaliseOrigin(sender?.origin || sender?.url || "");
  return senderOrigin ? allowedOrigins.has(senderOrigin) : false;
}

async function ensureAlarms() {
  await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
}

async function scanTradingViewTabs() {
  const tabs = await chrome.tabs.query({ url: [TRADINGVIEW_URL_PATTERN] });
  const activeTab = tabs.find((tab) => tab.active) || tabs[0] || null;
  await setStorage({
    [STORAGE_KEYS.tradingViewTabCount]: tabs.length,
    [STORAGE_KEYS.tabScanCompletedAt]: new Date().toISOString(),
  });
  return { tabs, activeTab };
}

function buildSnapshotContext(status) {
  const snapshot = status?.snapshot || null;
  return {
    snapshot,
    detectedBrokerAdapter: status?.adapter?.id || "tradingview_base",
    detectedBrokerProfile: snapshot?.broker?.broker_label || "",
    detectedAdapterConfidence: status?.adapter?.confidence ?? 0,
    detectedAdapterReliability: status?.adapter?.reliabilityLevel || "experimental",
    currentTabUrl: status?.pageUrl || "",
    currentTabTitle: status?.pageTitle || "",
    hasObservedTradingView: Boolean(snapshot?.generic?.is_tradingview_chart),
    isTradingSurfaceVisible: Boolean(
      snapshot?.generic?.trading_panel_visible ||
        snapshot?.generic?.order_entry_control_visible ||
        snapshot?.generic?.trading_surface_visible,
    ),
  };
}

function buildDeliveryWarning(state, runtime, snapshotContext) {
  const flushFailed = state[STORAGE_KEYS.lastFlushOutcome] === "failed";
  const lastKnownUpdatedAt = state[STORAGE_KEYS.lastKnownStatus]?.updatedAt;
  const isObservationFresh =
    snapshotContext.hasObservedTradingView && lastKnownUpdatedAt
      ? Date.now() - Date.parse(lastKnownUpdatedAt) <= 60_000
      : false;

  const runtimeWarning = runtime.warningMessage || "";
  if (!flushFailed || !isObservationFresh) {
    return runtimeWarning;
  }

  const flushError = state[STORAGE_KEYS.lastError] || "backend_sync_failed";
  const deliveryWarning = `Local monitoring is active, but backend sync is failing (${flushError}).`;
  return runtimeWarning ? `${runtimeWarning} ${deliveryWarning}` : deliveryWarning;
}

async function deriveAndPersistRuntimeState({ preserveSessionStatus = true } = {}) {
  const [settings, state] = await Promise.all([
    getSettings(),
    getStorage([
      STORAGE_KEYS.lastKnownStatus,
      STORAGE_KEYS.lastError,
      STORAGE_KEYS.extensionSessionKey,
      STORAGE_KEYS.extensionSessionStatus,
      STORAGE_KEYS.tradingViewTabCount,
      STORAGE_KEYS.tabScanCompletedAt,
      STORAGE_KEYS.currentWarning,
      STORAGE_KEYS.lastFlushOutcome,
    ]),
  ]);

  const snapshotContext = buildSnapshotContext(state[STORAGE_KEYS.lastKnownStatus]);
  const runtime = deriveExtensionRuntime({
    isAuthenticated: Boolean(settings.authToken),
    hasCompletedTabScan: Boolean(state[STORAGE_KEYS.tabScanCompletedAt]),
    hasTradingViewTab: (state[STORAGE_KEYS.tradingViewTabCount] ?? 0) > 0,
    hasObservedTradingView: snapshotContext.hasObservedTradingView,
    isTradingSurfaceVisible: snapshotContext.isTradingSurfaceVisible,
    hasMatchedBrokerAdapter: snapshotContext.detectedBrokerAdapter !== "tradingview_base",
    isTelemetryStale: snapshotContext.hasObservedTradingView
      ? Date.now() - Date.parse(state[STORAGE_KEYS.lastKnownStatus]?.updatedAt || 0) > TELEMETRY_STALE_AFTER_MS
      : false,
    lastError: preserveSessionStatus ? "" : state[STORAGE_KEYS.lastError] || "",
  });
  const effectiveWarning = buildDeliveryWarning(state, runtime, snapshotContext);

  const nextState = {
    [STORAGE_KEYS.extensionState]: runtime.extensionState,
    [STORAGE_KEYS.monitoringState]: runtime.monitoringState,
    [STORAGE_KEYS.currentWarning]: effectiveWarning,
    [STORAGE_KEYS.detectedBrokerAdapter]: snapshotContext.detectedBrokerAdapter,
    [STORAGE_KEYS.detectedBrokerProfile]: snapshotContext.detectedBrokerProfile,
    [STORAGE_KEYS.detectedAdapterConfidence]: snapshotContext.detectedAdapterConfidence,
    [STORAGE_KEYS.detectedAdapterReliability]: snapshotContext.detectedAdapterReliability,
  };
  if (snapshotContext.hasObservedTradingView) {
    nextState[STORAGE_KEYS.tradingViewDetectedAt] = state[STORAGE_KEYS.lastKnownStatus]?.updatedAt || "";
  }

  await setStorage(nextState);
  return {
    runtime,
    effectiveWarning,
    settings,
    state,
    snapshotContext,
  };
}

function buildExtensionSessionPayload({ runtime, effectiveWarning, settings, state, snapshotContext }) {
  const snapshot = snapshotContext.snapshot;
  return {
    extension_id: chrome.runtime.id,
    extension_version: EXTENSION_VERSION,
    platform: "tradingview",
    extension_state: runtime.extensionState,
    monitoring_state: runtime.monitoringState,
    tradingview_detected: snapshotContext.hasObservedTradingView || (state[STORAGE_KEYS.tradingViewTabCount] ?? 0) > 0,
    broker_adapter: snapshotContext.detectedBrokerAdapter,
    broker_profile: snapshotContext.detectedBrokerProfile || null,
    adapter_confidence: snapshotContext.detectedAdapterConfidence,
    adapter_reliability: snapshotContext.detectedAdapterReliability,
    warning_message: effectiveWarning || null,
    current_tab_url: snapshotContext.currentTabUrl || null,
    current_tab_title: snapshotContext.currentTabTitle || null,
    status_payload: {
      symbol: snapshot?.generic?.current_symbol || null,
      account_name: snapshot?.broker?.current_account_name || null,
      document_hidden: snapshot?.generic?.document_hidden ?? false,
      visibility_state: snapshot?.generic?.visibility_state || "visible",
      trading_panel_visible: snapshot?.generic?.trading_panel_visible || false,
      order_entry_control_visible: snapshot?.generic?.order_entry_control_visible || false,
      account_manager_entrypoint_visible: snapshot?.generic?.account_manager_entrypoint_visible || false,
      broker_selector_visible: snapshot?.generic?.broker_selector_visible || false,
      panel_open_control_visible: snapshot?.generic?.panel_open_control_visible || false,
      panel_maximize_control_visible: snapshot?.generic?.panel_maximize_control_visible || false,
      anchor_summary: snapshot?.broker?.anchor_summary || {},
      fxcm_footer_cluster_visible: snapshot?.broker?.fxcm_footer_cluster_visible || false,
      telemetry_updated_at: state[STORAGE_KEYS.lastKnownStatus]?.updatedAt || null,
      app_base_url: settings.appBaseUrl,
      api_base_url: settings.apiBaseUrl,
    },
  };
}

async function syncExtensionSession(trigger = "manual") {
  const stateContext = await deriveAndPersistRuntimeState();
  if (!stateContext.settings.authToken) {
    return { ok: false, skipped: true, reason: "missing_auth_token" };
  }

  const endpoint = stateContext.state[STORAGE_KEYS.extensionSessionKey] ? "heartbeat" : "connect";
  const url = buildExtensionSessionUrl(stateContext.settings.apiBaseUrl, endpoint);
  const payload = buildExtensionSessionPayload(stateContext);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stateContext.settings.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status}:${errorText || "request_failed"}`);
    }

    const body = await response.json();
    await setStorage({
      [STORAGE_KEYS.extensionSessionKey]: body.session.session_key,
      [STORAGE_KEYS.extensionSessionStatus]: body.session.status,
    });
    logger.info("extension_session_synced", {
      trigger,
      endpoint,
      sessionStatus: body.session.status,
      extensionState: body.session.extension_state,
    });
    return { ok: true, skipped: false, session: body.session };
  } catch (error) {
    logger.warn("extension_session_sync_failed", {
      trigger,
      endpoint,
      error: String(error),
    });
    await setStorage({
      [STORAGE_KEYS.extensionSessionStatus]: "offline",
    });
    return { ok: false, skipped: false, error: String(error) };
  }
}

async function disconnectExtensionSession() {
  const settings = await getSettings();
  if (!settings.authToken) {
    return;
  }

  try {
    await fetch(buildExtensionSessionUrl(settings.apiBaseUrl, "disconnect"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.authToken}`,
      },
      body: JSON.stringify({
        extension_id: chrome.runtime.id,
      }),
    });
  } catch (error) {
    logger.warn("extension_session_disconnect_failed", { error: String(error) });
  }
}

async function flushQueue(trigger = "unknown") {
  const queue = await getQueue();
  if (!queue.length) {
    return { sent: 0, skipped: true, reason: "empty_queue" };
  }

  const { apiBaseUrl, authToken } = await getSettings();
  const ingestUrl = apiBaseUrl ? buildIngestUrl(apiBaseUrl) : null;
  const batch = queue.slice(0, OBSERVER_CONFIG.maxBatchSize);

  if (!apiBaseUrl || !authToken) {
    const reason = "missing_api_config";
    logger.warn("flush_skipped", { reason, queued: queue.length });
    await setFlushState({
      [STORAGE_KEYS.lastAttemptAt]: new Date().toISOString(),
      [STORAGE_KEYS.lastAttemptUrl]: ingestUrl,
      [STORAGE_KEYS.lastFlushOutcome]: "failed",
      [STORAGE_KEYS.lastFlushStatusCode]: null,
      [STORAGE_KEYS.lastFlushTrigger]: trigger,
      [STORAGE_KEYS.lastFlushBatchSize]: batch.length,
      [STORAGE_KEYS.lastError]: reason,
    });
    return { sent: 0, skipped: true, reason };
  }

  const attemptedAt = new Date().toISOString();
  await setFlushState({
    [STORAGE_KEYS.lastAttemptAt]: attemptedAt,
    [STORAGE_KEYS.lastAttemptUrl]: ingestUrl,
    [STORAGE_KEYS.lastFlushOutcome]: "attempted",
    [STORAGE_KEYS.lastFlushStatusCode]: null,
    [STORAGE_KEYS.lastFlushTrigger]: trigger,
    [STORAGE_KEYS.lastFlushBatchSize]: batch.length,
    [STORAGE_KEYS.lastError]: "",
  });

  let response;
  try {
    response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: batch }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setFlushState({
      [STORAGE_KEYS.lastFlushOutcome]: "failed",
      [STORAGE_KEYS.lastFlushStatusCode]: null,
      [STORAGE_KEYS.lastError]: `network_error:${message}`,
    });
    throw new Error(`Broker telemetry ingest network failure: ${message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage = `http_${response.status}:${errorText || "empty_response"}`;
    await setFlushState({
      [STORAGE_KEYS.lastFlushOutcome]: "failed",
      [STORAGE_KEYS.lastFlushStatusCode]: response.status,
      [STORAGE_KEYS.lastError]: errorMessage,
    });
    throw new Error(`Broker telemetry ingest failed: ${response.status}`);
  }

  const result = await response.json();
  const succeededAt = new Date().toISOString();
  await setQueue(queue.slice(batch.length));
  await setFlushState({
    [STORAGE_KEYS.lastSuccessAt]: succeededAt,
    [STORAGE_KEYS.lastFlushOutcome]: "succeeded",
    [STORAGE_KEYS.lastFlushStatusCode]: response.status,
    [STORAGE_KEYS.lastError]: "",
  });
  logger.info("flush_complete", { accepted: result.accepted, batchSize: batch.length, trigger });
  return { sent: batch.length, skipped: false, accepted: result.accepted, status: response.status };
}

async function refreshRuntimeState(trigger = "runtime_refresh", { syncSession = true } = {}) {
  await scanTradingViewTabs();
  const runtimeState = await deriveAndPersistRuntimeState();
  if (syncSession) {
    await syncExtensionSession(trigger);
  }
  return runtimeState;
}

async function clearAuthState() {
  await disconnectExtensionSession();
  await setStorage({
    [STORAGE_KEYS.authToken]: "",
    [STORAGE_KEYS.authUserEmail]: "",
    [STORAGE_KEYS.authSyncedAt]: "",
    [STORAGE_KEYS.extensionSessionKey]: "",
    [STORAGE_KEYS.extensionSessionStatus]: "",
  });
  await refreshRuntimeState("auth_cleared", { syncSession: false });
}

chrome.runtime.onInstalled.addListener(async () => {
  await setStorage({
    [STORAGE_KEYS.mode]: DEFAULT_SETTINGS.mode,
    [STORAGE_KEYS.apiBaseUrl]: DEFAULT_SETTINGS.apiBaseUrl,
    [STORAGE_KEYS.appBaseUrl]: DEFAULT_SETTINGS.appBaseUrl,
  });
  await ensureAlarms();
  await refreshRuntimeState("installed");
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  await refreshRuntimeState("startup");
});

chrome.tabs.onUpdated.addListener(() => {
  void refreshRuntimeState("tabs_updated", { syncSession: false });
});
chrome.tabs.onRemoved.addListener(() => {
  void refreshRuntimeState("tabs_removed", { syncSession: false });
});
chrome.tabs.onActivated.addListener(() => {
  void refreshRuntimeState("tabs_activated", { syncSession: false });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "telemetry:observed") {
    void (async () => {
      const queue = await appendEvents(message.payload.events);
      await setStorage({
        [STORAGE_KEYS.lastKnownStatus]: {
          pageUrl: message.payload.pageUrl,
          pageTitle: message.payload.pageTitle,
          snapshot: message.payload.snapshot,
          adapter: message.payload.adapter,
          queued: queue.length,
          tabId: sender.tab?.id || null,
          updatedAt: new Date().toISOString(),
        },
      });
      await refreshRuntimeState("telemetry_observed");

      try {
        await flushQueue("enqueue");
      } catch (error) {
        logger.warn("flush_failed_after_enqueue", { error: String(error) });
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "telemetry:get-status") {
    void (async () => {
      await refreshRuntimeState("popup_status", { syncSession: false });
      const [queue, settings, state] = await Promise.all([
        getQueue(),
        getSettings(),
        getStorage([
          STORAGE_KEYS.lastKnownStatus,
          STORAGE_KEYS.lastAttemptAt,
          STORAGE_KEYS.lastSuccessAt,
          STORAGE_KEYS.lastAttemptUrl,
          STORAGE_KEYS.lastFlushOutcome,
          STORAGE_KEYS.lastFlushStatusCode,
          STORAGE_KEYS.lastFlushTrigger,
          STORAGE_KEYS.lastFlushBatchSize,
          STORAGE_KEYS.lastError,
        ]),
      ]);
      sendResponse({
        ok: true,
        status: state[STORAGE_KEYS.lastKnownStatus] || null,
        queueDepth: queue.length,
        settings,
        lastAttemptAt: state[STORAGE_KEYS.lastAttemptAt] || null,
        lastSuccessAt: state[STORAGE_KEYS.lastSuccessAt] || null,
        lastAttemptUrl: state[STORAGE_KEYS.lastAttemptUrl] || null,
        lastFlushOutcome: state[STORAGE_KEYS.lastFlushOutcome] || null,
        lastFlushStatusCode: state[STORAGE_KEYS.lastFlushStatusCode] || null,
        lastFlushTrigger: state[STORAGE_KEYS.lastFlushTrigger] || null,
        lastFlushBatchSize: state[STORAGE_KEYS.lastFlushBatchSize] || null,
        lastError: state[STORAGE_KEYS.lastError] || null,
      });
    })();
    return true;
  }

  if (message?.type === "telemetry:flush-now") {
    void (async () => {
      try {
        const result = await flushQueue("manual");
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (message?.type === "extension:disconnect-auth") {
    void (async () => {
      await clearAuthState();
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === "tiltguard:auth-sync") {
    void (async () => {
      if (!isTrustedExternalSender(sender)) {
        logger.warn("external_auth_sync_rejected", { sender: sender?.url || sender?.origin || null });
        sendResponse({ ok: false, error: "untrusted_sender" });
        return;
      }

      await setStorage({
        [STORAGE_KEYS.authToken]: message.payload.accessToken,
        [STORAGE_KEYS.authUserEmail]: message.payload.userEmail || "",
        [STORAGE_KEYS.authSyncedAt]: new Date().toISOString(),
      });
      await refreshRuntimeState("external_auth_sync");

      try {
        await flushQueue("external_auth_sync");
      } catch (error) {
        logger.warn("flush_failed_after_external_auth_sync", { error: String(error) });
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "tiltguard:auth-clear") {
    void (async () => {
      if (!isTrustedExternalSender(sender)) {
        sendResponse({ ok: false, error: "untrusted_sender" });
        return;
      }

      await clearAuthState();
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    void flushQueue("alarm").catch((error) => {
      logger.warn("scheduled_flush_failed", { error: String(error) });
    });
    return;
  }

  if (alarm.name === HEARTBEAT_ALARM) {
    void refreshRuntimeState("heartbeat_alarm").catch((error) => {
      logger.warn("heartbeat_refresh_failed", { error: String(error) });
    });
  }
});
