import { createLogger } from "../shared/log.js";
import { EXTENSION_CONFIG } from "../shared/extension-config.js";
import { OBSERVER_CONFIG } from "../shared/selectors.js";
import { DEFAULT_SETTINGS, STORAGE_KEYS, getSettings, getStorage, setStorage } from "../shared/storage.js";

const logger = createLogger("background");
const FLUSH_ALARM = "telemetry-flush";

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

async function setLastStatus(status) {
  await setStorage({ [STORAGE_KEYS.lastKnownStatus]: status });
}

function buildIngestUrl(apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/$/, "")}/broker-telemetry/ingest`;
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

async function setFlushState(partialState) {
  await setStorage(partialState);
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
    if (response.status === 401 || response.status === 403) {
      logger.warn("telemetry_ingest_auth_failed", {
        status: response.status,
        trigger,
      });
    } else {
      logger.warn("telemetry_ingest_failed", {
        status: response.status,
        trigger,
      });
    }
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

async function ensureAlarm() {
  await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => {
  await setStorage({
    [STORAGE_KEYS.mode]: DEFAULT_SETTINGS.mode,
    [STORAGE_KEYS.apiBaseUrl]: DEFAULT_SETTINGS.apiBaseUrl,
    [STORAGE_KEYS.appBaseUrl]: DEFAULT_SETTINGS.appBaseUrl,
  });
  await ensureAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "telemetry:observed") {
    void (async () => {
      const queue = await appendEvents(message.payload.events);
      await setLastStatus({
        pageUrl: message.payload.pageUrl,
        pageTitle: message.payload.pageTitle,
        snapshot: message.payload.snapshot,
        queued: queue.length,
        tabId: sender.tab?.id || null,
        updatedAt: new Date().toISOString(),
      });
      logger.info("events_enqueued", {
        count: message.payload.events.length,
        queued: queue.length,
        tabId: sender.tab?.id || null,
      });
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

  if (message?.type === "telemetry:update-settings") {
    void (async () => {
      await setStorage({
        [STORAGE_KEYS.apiBaseUrl]: message.payload.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
        [STORAGE_KEYS.appBaseUrl]: message.payload.appBaseUrl || DEFAULT_SETTINGS.appBaseUrl,
      });
      try {
        await flushQueue("settings_update");
      } catch (error) {
        logger.warn("flush_failed_after_settings_update", { error: String(error) });
      }
      sendResponse({ ok: true });
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
      logger.info("external_auth_sync_applied", {
        userEmail: message.payload.userEmail || null,
      });

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

      await setStorage({
        [STORAGE_KEYS.authToken]: "",
        [STORAGE_KEYS.authUserEmail]: "",
        [STORAGE_KEYS.authSyncedAt]: "",
      });
      logger.info("external_auth_cleared");
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FLUSH_ALARM) {
    return;
  }

  void flushQueue("alarm").catch((error) => {
    logger.warn("scheduled_flush_failed", { error: String(error) });
  });
});
