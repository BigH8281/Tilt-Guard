import {
  EXTENSION_CONFIG,
  EXTENSION_MODES,
  getConfiguredModeConfig,
  getModeConfig,
  normaliseBaseUrl,
  normaliseMode,
} from "./extension-config.js";

export const STORAGE_KEYS = {
  mode: "mode",
  apiBaseUrl: "apiBaseUrl",
  appBaseUrl: "appBaseUrl",
  modeConfigVersion: "modeConfigVersion",
  modeChangedAt: "modeChangedAt",
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

export const MODE_CONFIG_VERSION = 2;

const LEGACY_LOCAL_DEFAULTS = getModeConfig(EXTENSION_MODES.LOCAL);
const DEFAULT_MODE_SETTINGS = getConfiguredModeConfig(EXTENSION_CONFIG.defaultMode);

export const DEFAULT_SETTINGS = {
  mode: DEFAULT_MODE_SETTINGS.mode,
  apiBaseUrl: DEFAULT_MODE_SETTINGS.apiBaseUrl,
  appBaseUrl: DEFAULT_MODE_SETTINGS.appBaseUrl,
  modeConfigVersion: MODE_CONFIG_VERSION,
  modeChangedAt: "",
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

export function getModeStoragePatch(mode, { changedAt = "" } = {}) {
  const config = getConfiguredModeConfig(mode);
  return {
    [STORAGE_KEYS.mode]: config.mode,
    [STORAGE_KEYS.apiBaseUrl]: config.apiBaseUrl,
    [STORAGE_KEYS.appBaseUrl]: config.appBaseUrl,
    [STORAGE_KEYS.modeConfigVersion]: MODE_CONFIG_VERSION,
    [STORAGE_KEYS.modeChangedAt]: changedAt,
  };
}

function normaliseStoredMode(value) {
  return typeof value === "string" && value.trim() ? normaliseMode(value) : "";
}

function inferModeFromUrls({ appBaseUrl, apiBaseUrl }) {
  const normalisedAppBaseUrl = normaliseBaseUrl(appBaseUrl);
  const normalisedApiBaseUrl = normaliseBaseUrl(apiBaseUrl);

  if (
    normalisedAppBaseUrl === normaliseBaseUrl(LEGACY_LOCAL_DEFAULTS.appBaseUrl) &&
    normalisedApiBaseUrl === normaliseBaseUrl(LEGACY_LOCAL_DEFAULTS.apiBaseUrl)
  ) {
    return EXTENSION_MODES.LOCAL;
  }

  return EXTENSION_CONFIG.defaultMode;
}

export function shouldMigrateLegacyModeDefaults(stored) {
  const storedMode = normaliseStoredMode(stored[STORAGE_KEYS.mode]);
  if (stored[STORAGE_KEYS.modeConfigVersion] === MODE_CONFIG_VERSION) {
    return false;
  }

  const storedAppBaseUrl = normaliseBaseUrl(stored[STORAGE_KEYS.appBaseUrl]);
  const storedApiBaseUrl = normaliseBaseUrl(stored[STORAGE_KEYS.apiBaseUrl]);
  const isLegacyLocalMode = storedMode === EXTENSION_MODES.LOCAL;
  const matchesLegacyLocalDefaults =
    storedAppBaseUrl === normaliseBaseUrl(LEGACY_LOCAL_DEFAULTS.appBaseUrl) &&
    storedApiBaseUrl === normaliseBaseUrl(LEGACY_LOCAL_DEFAULTS.apiBaseUrl);
  const hasExistingAuth = Boolean(stored[STORAGE_KEYS.authToken] || stored[STORAGE_KEYS.authSyncedAt]);

  return isLegacyLocalMode && matchesLegacyLocalDefaults && !hasExistingAuth;
}

export function deriveModeSettings(stored) {
  if (shouldMigrateLegacyModeDefaults(stored)) {
    return {
      ...DEFAULT_SETTINGS,
      modeChangedAt: stored[STORAGE_KEYS.modeChangedAt] || "",
    };
  }

  const storedMode = normaliseStoredMode(stored[STORAGE_KEYS.mode]);
  const resolvedMode =
    storedMode ||
    inferModeFromUrls({
      appBaseUrl: stored[STORAGE_KEYS.appBaseUrl],
      apiBaseUrl: stored[STORAGE_KEYS.apiBaseUrl],
    });
  const modeDefaults = getConfiguredModeConfig(resolvedMode);
  const storedAppBaseUrl = normaliseBaseUrl(stored[STORAGE_KEYS.appBaseUrl]);
  const storedApiBaseUrl = normaliseBaseUrl(stored[STORAGE_KEYS.apiBaseUrl]);

  return {
    mode: modeDefaults.mode,
    apiBaseUrl: storedApiBaseUrl || modeDefaults.apiBaseUrl,
    appBaseUrl: storedAppBaseUrl || modeDefaults.appBaseUrl,
    modeConfigVersion: MODE_CONFIG_VERSION,
    modeChangedAt: stored[STORAGE_KEYS.modeChangedAt] || "",
  };
}

export async function getSettings() {
  const stored = await getStorage([
    STORAGE_KEYS.mode,
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.appBaseUrl,
    STORAGE_KEYS.modeConfigVersion,
    STORAGE_KEYS.modeChangedAt,
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
  const modeSettings = deriveModeSettings(stored);
  return {
    mode: modeSettings.mode,
    apiBaseUrl: modeSettings.apiBaseUrl,
    appBaseUrl: modeSettings.appBaseUrl,
    modeConfigVersion: modeSettings.modeConfigVersion,
    modeChangedAt: modeSettings.modeChangedAt,
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
