export const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  authToken: "authToken",
  telemetryQueue: "telemetryQueue",
  lastKnownStatus: "lastKnownStatus",
  lastAttemptAt: "lastAttemptAt",
  lastSuccessAt: "lastSuccessAt",
  lastAttemptUrl: "lastAttemptUrl",
  lastFlushOutcome: "lastFlushOutcome",
  lastFlushStatusCode: "lastFlushStatusCode",
  lastFlushTrigger: "lastFlushTrigger",
  lastFlushBatchSize: "lastFlushBatchSize",
  lastError: "lastError",
};

export const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://127.0.0.1:8000",
  authToken: "",
};

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStorage(values) {
  await chrome.storage.local.set(values);
}

export async function getSettings() {
  const stored = await getStorage([STORAGE_KEYS.apiBaseUrl, STORAGE_KEYS.authToken]);
  return {
    apiBaseUrl: stored[STORAGE_KEYS.apiBaseUrl] || DEFAULT_SETTINGS.apiBaseUrl,
    authToken: stored[STORAGE_KEYS.authToken] || DEFAULT_SETTINGS.authToken,
  };
}
