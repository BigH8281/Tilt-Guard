import { AUTH_RECOVERY_QUEUE_EVENTS, isAuthFailureStatus, trimQueueForAuthRecovery } from "./auth-recovery.js";
import { TELEMETRY_STALE_AFTER_MS, deriveExtensionRuntime } from "./extension-state.js";
import { isQuotaExceededError, limitTelemetryQueue } from "./queue-policy.js";
import { needsRecoveryProbe } from "./runtime-recovery.js";
import { createLogger } from "../shared/log.js";
import {
  EXTENSION_MODES,
  getAllowedExternalOrigins,
  getConfiguredModeConfig,
  isAbsoluteHttpUrl,
} from "../shared/extension-config.js";
import { OBSERVER_CONFIG } from "../shared/selectors.js";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  deriveModeSettings,
  getModeStoragePatch,
  getSettings,
  getStorage,
  setStorage,
} from "../shared/storage.js";

const logger = createLogger("background");
const FLUSH_ALARM = "telemetry-flush";
const HEARTBEAT_ALARM = "extension-session-heartbeat";
const TRADINGVIEW_URL_PATTERN = "https://www.tradingview.com/chart/*";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const RECOVERY_PROBE_DELAY_MS = 750;
let bootstrapPromise = null;

function buildIngestUrl(apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/$/, "")}/broker-telemetry/ingest`;
}

function buildExtensionSessionUrl(apiBaseUrl, path) {
  return `${apiBaseUrl.replace(/\/$/, "")}/extension-sessions/${path}`;
}

async function getQueue() {
  const stored = await getStorage([STORAGE_KEYS.telemetryQueue]);
  const queue = stored[STORAGE_KEYS.telemetryQueue] || [];
  const normalisedQueue = limitTelemetryQueue(queue);
  if (normalisedQueue.length !== queue.length) {
    await setStorage({ [STORAGE_KEYS.telemetryQueue]: normalisedQueue });
    logger.warn("telemetry_queue_trimmed_on_read", {
      retained: normalisedQueue.length,
      previousSize: queue.length,
    });
  }
  return normalisedQueue;
}

async function setQueue(queue) {
  await setStorage({ [STORAGE_KEYS.telemetryQueue]: limitTelemetryQueue(queue) });
}

async function expireExtensionAuth(reason, { retainQueue = true } = {}) {
  const currentQueue = retainQueue ? await getQueue() : [];
  const retainedQueue = retainQueue ? trimQueueForAuthRecovery(currentQueue) : [];
  await setStorage({
    [STORAGE_KEYS.authToken]: "",
    [STORAGE_KEYS.authUserEmail]: "",
    [STORAGE_KEYS.authSyncedAt]: "",
    [STORAGE_KEYS.extensionSessionKey]: "",
    [STORAGE_KEYS.extensionSessionStatus]: "",
    [STORAGE_KEYS.telemetryQueue]: retainedQueue,
    [STORAGE_KEYS.lastFlushOutcome]: "failed",
    [STORAGE_KEYS.lastFlushStatusCode]: null,
    [STORAGE_KEYS.lastError]: reason,
  });
  await deriveAndPersistRuntimeState({ preserveSessionStatus: false });
  logger.warn("extension_auth_expired", {
    reason,
    retainedQueue: retainedQueue.length,
    retainedLimit: AUTH_RECOVERY_QUEUE_EVENTS,
  });
}

async function appendEvents(events) {
  const queue = await getQueue();
  let nextQueue = limitTelemetryQueue([...queue, ...events]);

  while (true) {
    try {
      await setQueue(nextQueue);
      return nextQueue;
    } catch (error) {
      if (!isQuotaExceededError(error) || nextQueue.length <= events.length) {
        throw error;
      }

      nextQueue = nextQueue.slice(Math.ceil(nextQueue.length / 2));
      logger.warn("telemetry_queue_trimmed_after_quota_error", {
        retained: nextQueue.length,
      });
    }
  }
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

async function isTrustedExternalSender(sender) {
  const settings = await getSettings();
  const allowedOrigins = new Set(
    getAllowedExternalOrigins(settings.mode)
      .map((value) => normaliseOrigin(value))
      .filter(Boolean),
  );
  const senderOrigin = normaliseOrigin(sender?.origin || sender?.url || "");
  return senderOrigin ? allowedOrigins.has(senderOrigin) : false;
}

async function ensureModeSettings() {
  const stored = await getStorage([
    STORAGE_KEYS.mode,
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.appBaseUrl,
    STORAGE_KEYS.modeConfigVersion,
    STORAGE_KEYS.modeChangedAt,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.authSyncedAt,
  ]);
  const resolvedModeSettings = deriveModeSettings(stored);
  const needsPatch =
    stored[STORAGE_KEYS.mode] !== resolvedModeSettings.mode ||
    stored[STORAGE_KEYS.apiBaseUrl] !== resolvedModeSettings.apiBaseUrl ||
    stored[STORAGE_KEYS.appBaseUrl] !== resolvedModeSettings.appBaseUrl ||
    stored[STORAGE_KEYS.modeConfigVersion] !== resolvedModeSettings.modeConfigVersion ||
    stored[STORAGE_KEYS.modeChangedAt] !== resolvedModeSettings.modeChangedAt;

  if (needsPatch) {
    await setStorage({
      [STORAGE_KEYS.mode]: resolvedModeSettings.mode,
      [STORAGE_KEYS.apiBaseUrl]: resolvedModeSettings.apiBaseUrl,
      [STORAGE_KEYS.appBaseUrl]: resolvedModeSettings.appBaseUrl,
      [STORAGE_KEYS.modeConfigVersion]: resolvedModeSettings.modeConfigVersion,
      [STORAGE_KEYS.modeChangedAt]: resolvedModeSettings.modeChangedAt,
    });
  }

  return resolvedModeSettings;
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

async function probeTradingViewTab(tabId, reason = "background_probe") {
  if (!tabId) {
    return { ok: false, skipped: true, reason: "missing_tab_id" };
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "telemetry:collect-now",
      reason,
    });
    logger.info("telemetry_probe_sent", { tabId, reason });
    return { ok: true, response };
  } catch (error) {
    logger.info("telemetry_probe_skipped", {
      tabId,
      reason,
      error: String(error),
    });
    return { ok: false, error: String(error) };
  }
}

async function probeTradingViewTabs(trigger = "background_probe") {
  const { tabs, activeTab } = await scanTradingViewTabs();
  if (!tabs.length) {
    return { ok: false, skipped: true, reason: "no_tradingview_tabs" };
  }

  const orderedTabs = [
    ...(activeTab ? [activeTab] : []),
    ...tabs.filter((tab) => tab.id !== activeTab?.id),
  ];

  for (const tab of orderedTabs) {
    const result = await probeTradingViewTab(tab.id, trigger);
    if (result.ok) {
      return { ok: true, tabId: tab.id };
    }
  }

  return { ok: false, skipped: true, reason: "no_content_listener" };
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
      trade: snapshot?.trade || {},
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
  if (!isAbsoluteHttpUrl(stateContext.settings.apiBaseUrl)) {
    return { ok: false, skipped: true, reason: "missing_api_config" };
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
      if (isAuthFailureStatus(response.status)) {
        await expireExtensionAuth(`http_${response.status}:${errorText || "invalid_auth"}`);
      }
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
  if (!settings.authToken || !isAbsoluteHttpUrl(settings.apiBaseUrl)) {
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

  if (!isAbsoluteHttpUrl(apiBaseUrl) || !authToken) {
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
    if (isAuthFailureStatus(response.status)) {
      await expireExtensionAuth(errorMessage);
    }
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
  await ensureModeSettings();
  await scanTradingViewTabs();
  const runtimeState = await deriveAndPersistRuntimeState();
  if (syncSession) {
    await syncExtensionSession(trigger);
  }
  return runtimeState;
}

async function bootstrapRuntime(trigger = "service_worker_bootstrap") {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    await ensureModeSettings();
    await ensureAlarms();
    await scanTradingViewTabs();

    let runtimeState = await deriveAndPersistRuntimeState();
    const shouldProbe = needsRecoveryProbe({
      isAuthenticated: Boolean(runtimeState.settings.authToken),
      hasCompletedTabScan: Boolean(runtimeState.state[STORAGE_KEYS.tabScanCompletedAt]),
      hasTradingViewTab: (runtimeState.state[STORAGE_KEYS.tradingViewTabCount] ?? 0) > 0,
      lastKnownUpdatedAt: runtimeState.state[STORAGE_KEYS.lastKnownStatus]?.updatedAt || "",
      extensionSessionStatus: runtimeState.state[STORAGE_KEYS.extensionSessionStatus] || "",
    });

    if (shouldProbe) {
      await probeTradingViewTabs(`${trigger}_probe`);
      await new Promise((resolve) => setTimeout(resolve, RECOVERY_PROBE_DELAY_MS));
      await scanTradingViewTabs();
      runtimeState = await deriveAndPersistRuntimeState();
    }

    if (runtimeState.settings.authToken && isAbsoluteHttpUrl(runtimeState.settings.apiBaseUrl)) {
      await syncExtensionSession(trigger);
    }

    return runtimeState;
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
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

async function switchMode(nextMode) {
  const previousSettings = await getSettings();
  const resolvedMode = nextMode === EXTENSION_MODES.LOCAL ? EXTENSION_MODES.LOCAL : EXTENSION_MODES.HOSTED;
  if (previousSettings.mode === resolvedMode) {
    return { changed: false, settings: previousSettings };
  }

  const nextSettings = getConfiguredModeConfig(resolvedMode);
  await disconnectExtensionSession();
  await setStorage({
    ...getModeStoragePatch(resolvedMode, { changedAt: new Date().toISOString() }),
    [STORAGE_KEYS.authToken]: "",
    [STORAGE_KEYS.authUserEmail]: "",
    [STORAGE_KEYS.authSyncedAt]: "",
    [STORAGE_KEYS.extensionSessionKey]: "",
    [STORAGE_KEYS.extensionSessionStatus]: "",
    [STORAGE_KEYS.telemetryQueue]: [],
    [STORAGE_KEYS.lastKnownStatus]: null,
    [STORAGE_KEYS.lastAttemptAt]: "",
    [STORAGE_KEYS.lastSuccessAt]: "",
    [STORAGE_KEYS.lastAttemptUrl]: "",
    [STORAGE_KEYS.lastFlushOutcome]: "",
    [STORAGE_KEYS.lastFlushStatusCode]: "",
    [STORAGE_KEYS.lastFlushTrigger]: "",
    [STORAGE_KEYS.lastFlushBatchSize]: "",
    [STORAGE_KEYS.lastError]: "",
    [STORAGE_KEYS.currentWarning]: "",
    [STORAGE_KEYS.extensionState]: "signed_out",
    [STORAGE_KEYS.monitoringState]: "inactive",
    [STORAGE_KEYS.detectedBrokerAdapter]: DEFAULT_SETTINGS.detectedBrokerAdapter,
    [STORAGE_KEYS.detectedBrokerProfile]: DEFAULT_SETTINGS.detectedBrokerProfile,
    [STORAGE_KEYS.detectedAdapterConfidence]: DEFAULT_SETTINGS.detectedAdapterConfidence,
    [STORAGE_KEYS.detectedAdapterReliability]: DEFAULT_SETTINGS.detectedAdapterReliability,
    [STORAGE_KEYS.tradingViewDetectedAt]: "",
  });
  await refreshRuntimeState("mode_switched", { syncSession: false });
  return {
    changed: true,
    settings: {
      ...previousSettings,
      ...nextSettings,
      mode: resolvedMode,
      authToken: "",
      authUserEmail: "",
      authSyncedAt: "",
      extensionSessionKey: "",
      extensionSessionStatus: "",
    },
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  await bootstrapRuntime("installed");
});

chrome.runtime.onStartup.addListener(async () => {
  await bootstrapRuntime("startup");
});

void bootstrapRuntime("service_worker_loaded");

chrome.tabs.onUpdated.addListener(() => {
  void bootstrapRuntime("tabs_updated");
});
chrome.tabs.onRemoved.addListener(() => {
  void bootstrapRuntime("tabs_removed");
});
chrome.tabs.onActivated.addListener(() => {
  void bootstrapRuntime("tabs_activated");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "telemetry:observed") {
    sendResponse({ ok: true, accepted: true });
    void (async () => {
      try {
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
        await flushQueue("enqueue");
      } catch (error) {
        logger.warn("telemetry_observed_failed", { error: String(error) });
      }
    })();
    return false;
  }

  if (message?.type === "telemetry:get-status") {
    void (async () => {
      await bootstrapRuntime("popup_status");
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

  if (message?.type === "extension:set-mode") {
    void (async () => {
      try {
        const result = await switchMode(message.mode);
        sendResponse({ ok: true, changed: result.changed, settings: await getSettings() });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
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
      if (!(await isTrustedExternalSender(sender))) {
        logger.warn("external_auth_sync_rejected", { sender: sender?.url || sender?.origin || null });
        sendResponse({ ok: false, error: "untrusted_sender" });
        return;
      }

      await setStorage({
        [STORAGE_KEYS.authToken]: message.payload.accessToken,
        [STORAGE_KEYS.authUserEmail]: message.payload.userEmail || "",
        [STORAGE_KEYS.authSyncedAt]: new Date().toISOString(),
      });
      await bootstrapRuntime("external_auth_sync");

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
      if (!(await isTrustedExternalSender(sender))) {
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
    void bootstrapRuntime("heartbeat_alarm").catch((error) => {
      logger.warn("heartbeat_refresh_failed", { error: String(error) });
    });
  }
});
