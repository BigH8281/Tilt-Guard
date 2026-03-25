import { EXTENSION_CONFIG } from "./extension-config.js";

export const STORAGE_KEYS = {
  mode: "mode",
  apiBaseUrl: "apiBaseUrl",
  appBaseUrl: "appBaseUrl",
  authToken: "authToken",
  authUserEmail: "authUserEmail",
  authSyncedAt: "authSyncedAt",
  extensionSessionKey: "extensionSessionKey",
  extensionSessionStatus: "extensionSessionStatus",
  extensionState: "extensionState",
  monitoringState: "monitoringState",
  currentWarning: "currentWarning",
  detectedBrokerAdapter: "detectedBrokerAdapter",
  detectedBrokerProfile: "detectedBrokerProfile",
  detectedAdapterConfidence: "detectedAdapterConfidence",
  detectedAdapterReliability: "detectedAdapterReliability",
  tradingViewDetectedAt: "tradingViewDetectedAt",
  tradingViewTabCount: "tradingViewTabCount",
  tabScanCompletedAt: "tabScanCompletedAt",
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
  extensionSessionKey: "",
  extensionSessionStatus: "",
  extensionState: "signed_out",
  monitoringState: "inactive",
  currentWarning: "",
  detectedBrokerAdapter: "tradingview_base",
  detectedBrokerProfile: "",
  detectedAdapterConfidence: 0,
  detectedAdapterReliability: "experimental",
  tradingViewDetectedAt: "",
  tradingViewTabCount: 0,
  tabScanCompletedAt: "",
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
    STORAGE_KEYS.extensionSessionKey,
    STORAGE_KEYS.extensionSessionStatus,
    STORAGE_KEYS.extensionState,
    STORAGE_KEYS.monitoringState,
    STORAGE_KEYS.currentWarning,
    STORAGE_KEYS.detectedBrokerAdapter,
    STORAGE_KEYS.detectedBrokerProfile,
    STORAGE_KEYS.detectedAdapterConfidence,
    STORAGE_KEYS.detectedAdapterReliability,
    STORAGE_KEYS.tradingViewDetectedAt,
    STORAGE_KEYS.tradingViewTabCount,
    STORAGE_KEYS.tabScanCompletedAt,
  ]);
  return {
    mode: stored[STORAGE_KEYS.mode] || DEFAULT_SETTINGS.mode,
    apiBaseUrl: stored[STORAGE_KEYS.apiBaseUrl] || DEFAULT_SETTINGS.apiBaseUrl,
    appBaseUrl: stored[STORAGE_KEYS.appBaseUrl] || DEFAULT_SETTINGS.appBaseUrl,
    authToken: stored[STORAGE_KEYS.authToken] || DEFAULT_SETTINGS.authToken,
    authUserEmail: stored[STORAGE_KEYS.authUserEmail] || DEFAULT_SETTINGS.authUserEmail,
    authSyncedAt: stored[STORAGE_KEYS.authSyncedAt] || DEFAULT_SETTINGS.authSyncedAt,
    extensionSessionKey: stored[STORAGE_KEYS.extensionSessionKey] || DEFAULT_SETTINGS.extensionSessionKey,
    extensionSessionStatus: stored[STORAGE_KEYS.extensionSessionStatus] || DEFAULT_SETTINGS.extensionSessionStatus,
    extensionState: stored[STORAGE_KEYS.extensionState] || DEFAULT_SETTINGS.extensionState,
    monitoringState: stored[STORAGE_KEYS.monitoringState] || DEFAULT_SETTINGS.monitoringState,
    currentWarning: stored[STORAGE_KEYS.currentWarning] || DEFAULT_SETTINGS.currentWarning,
    detectedBrokerAdapter:
      stored[STORAGE_KEYS.detectedBrokerAdapter] || DEFAULT_SETTINGS.detectedBrokerAdapter,
    detectedBrokerProfile:
      stored[STORAGE_KEYS.detectedBrokerProfile] || DEFAULT_SETTINGS.detectedBrokerProfile,
    detectedAdapterConfidence:
      stored[STORAGE_KEYS.detectedAdapterConfidence] ?? DEFAULT_SETTINGS.detectedAdapterConfidence,
    detectedAdapterReliability:
      stored[STORAGE_KEYS.detectedAdapterReliability] || DEFAULT_SETTINGS.detectedAdapterReliability,
    tradingViewDetectedAt:
      stored[STORAGE_KEYS.tradingViewDetectedAt] || DEFAULT_SETTINGS.tradingViewDetectedAt,
    tradingViewTabCount: stored[STORAGE_KEYS.tradingViewTabCount] ?? DEFAULT_SETTINGS.tradingViewTabCount,
    tabScanCompletedAt: stored[STORAGE_KEYS.tabScanCompletedAt] || DEFAULT_SETTINGS.tabScanCompletedAt,
  };
}
