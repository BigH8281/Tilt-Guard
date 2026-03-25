export const EXTENSION_MODES = {
  HOSTED: "HOSTED",
  LOCAL: "LOCAL",
};

export const EXTENSION_CONFIG = {
  defaultMode: EXTENSION_MODES.HOSTED,
  modes: {
    [EXTENSION_MODES.HOSTED]: {
      appBaseUrl: "https://web-production-91bf.up.railway.app",
      apiBaseUrl: "https://web-production-91bf.up.railway.app",
    },
    [EXTENSION_MODES.LOCAL]: {
      appBaseUrl: "http://127.0.0.1:5173",
      apiBaseUrl: "http://127.0.0.1:8000",
    },
  },
};

export function normaliseMode(value) {
  if (typeof value !== "string") {
    return EXTENSION_CONFIG.defaultMode;
  }

  const upperValue = value.trim().toUpperCase();
  return EXTENSION_CONFIG.modes[upperValue] ? upperValue : EXTENSION_CONFIG.defaultMode;
}

export function getModeConfig(mode) {
  const normalisedMode = normaliseMode(mode);
  const config = EXTENSION_CONFIG.modes[normalisedMode];
  return {
    mode: normalisedMode,
    appBaseUrl: config.appBaseUrl,
    apiBaseUrl: config.apiBaseUrl,
  };
}

export function isAbsoluteHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normaliseBaseUrl(value) {
  if (!isAbsoluteHttpUrl(value)) {
    return "";
  }

  return value.replace(/\/+$/, "");
}

export function getConfiguredModeConfig(mode) {
  const config = getModeConfig(mode);
  return {
    ...config,
    appBaseUrl: normaliseBaseUrl(config.appBaseUrl),
    apiBaseUrl: normaliseBaseUrl(config.apiBaseUrl),
  };
}

export function loopbackAliases(url) {
  const baseUrl = normaliseBaseUrl(url);
  if (!baseUrl) {
    return [];
  }

  const parsed = new URL(baseUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    return [baseUrl];
  }

  const aliases = ["127.0.0.1", "localhost"].map((hostname) => {
    parsed.hostname = hostname;
    return parsed.toString().replace(/\/+$/, "");
  });

  return [...new Set(aliases)];
}

export function getAllowedExternalOrigins(mode) {
  const { appBaseUrl } = getConfiguredModeConfig(mode);
  return loopbackAliases(appBaseUrl);
}
