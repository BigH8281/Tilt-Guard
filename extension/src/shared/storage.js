import { EXTENSION_CONFIG } from "./extension-config.js";

export const STORAGE_KEYS = {
  mode: "mode",
  apiBaseUrl: "apiBaseUrl",
  appBaseUrl: "appBaseUrl",
  authToken: "authToken",
  authUserEmail: "authUserEmail",
  authSyncedAt: "authSyncedAt",
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
  mode: EXTENSION_CONFIG.mode,
  apiBaseUrl: EXTENSION_CONFIG.apiBaseUrl,
  appBaseUrl: EXTENSION_CONFIG.appBaseUrl,
  authToken: "",
  authUserEmail: "",
  authSyncedAt: "",
};

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStorage(values) {
  await chrome.storage.local.set(values);
}

export async function getSettings() {
  const stored = await getStorage([
    STORAGE_KEYS.mode,
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.appBaseUrl,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.authUserEmail,
    STORAGE_KEYS.authSyncedAt,
  ]);
  return {
    mode: stored[STORAGE_KEYS.mode] || DEFAULT_SETTINGS.mode,
    apiBaseUrl: stored[STORAGE_KEYS.apiBaseUrl] || DEFAULT_SETTINGS.apiBaseUrl,
    appBaseUrl: stored[STORAGE_KEYS.appBaseUrl] || DEFAULT_SETTINGS.appBaseUrl,
    authToken: stored[STORAGE_KEYS.authToken] || DEFAULT_SETTINGS.authToken,
    authUserEmail: stored[STORAGE_KEYS.authUserEmail] || DEFAULT_SETTINGS.authUserEmail,
    authSyncedAt: stored[STORAGE_KEYS.authSyncedAt] || DEFAULT_SETTINGS.authSyncedAt,
  };
}
