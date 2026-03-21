import { createLogger } from "../shared/log.js";
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

async function setLastError(message) {
  await setStorage({ [STORAGE_KEYS.lastError]: message });
}

async function flushQueue() {
  const queue = await getQueue();
  if (!queue.length) {
    return { sent: 0, skipped: true };
  }

  const { apiBaseUrl, authToken } = await getSettings();
  if (!apiBaseUrl || !authToken) {
    const reason = "missing_api_config";
    logger.warn("flush_skipped", { reason, queued: queue.length });
    await setLastError(reason);
    return { sent: 0, skipped: true };
  }

  const batch = queue.slice(0, OBSERVER_CONFIG.maxBatchSize);
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/broker-telemetry/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ events: batch }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    await setLastError(`http_${response.status}:${errorText}`);
    throw new Error(`Broker telemetry ingest failed: ${response.status}`);
  }

  const result = await response.json();
  await setQueue(queue.slice(batch.length));
  await setStorage({ [STORAGE_KEYS.lastFlushAt]: new Date().toISOString() });
  await setLastError("");
  logger.info("flush_complete", { accepted: result.accepted, batchSize: batch.length });
  return { sent: batch.length, skipped: false };
}

async function ensureAlarm() {
  await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => {
  await setStorage({
    [STORAGE_KEYS.apiBaseUrl]: DEFAULT_SETTINGS.apiBaseUrl,
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
        await flushQueue();
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
        getStorage([STORAGE_KEYS.lastKnownStatus, STORAGE_KEYS.lastFlushAt, STORAGE_KEYS.lastError]),
      ]);
      sendResponse({
        ok: true,
        status: state[STORAGE_KEYS.lastKnownStatus] || null,
        queueDepth: queue.length,
        settings,
        lastFlushAt: state[STORAGE_KEYS.lastFlushAt] || null,
        lastError: state[STORAGE_KEYS.lastError] || null,
      });
    })();
    return true;
  }

  if (message?.type === "telemetry:update-settings") {
    void (async () => {
      await setStorage({
        [STORAGE_KEYS.apiBaseUrl]: message.payload.apiBaseUrl,
        [STORAGE_KEYS.authToken]: message.payload.authToken,
      });
      try {
        await flushQueue();
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
        const result = await flushQueue();
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FLUSH_ALARM) {
    return;
  }

  void flushQueue().catch((error) => {
    logger.warn("scheduled_flush_failed", { error: String(error) });
  });
});
