const DEFAULT_DEV_API_BASE_URL = "http://127.0.0.1:8000";

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return DEFAULT_DEV_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return DEFAULT_DEV_API_BASE_URL;
}

const API_BASE_URL = resolveApiBaseUrl();
let unauthorizedHandler = null;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const hasJson = contentType.includes("application/json");
  const body = hasJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null
        ? body.detail ?? "Request failed."
        : body || "Request failed.";

    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg || item).join(" ")
      : detail;

    const error = new Error(message);
    error.status = response.status;
    error.path = path;

    const sentAuthorizationHeader =
      typeof options.headers === "object" && options.headers !== null
        ? "Authorization" in options.headers
        : false;

    if (response.status === 401 && sentAuthorizationHeader && typeof unauthorizedHandler === "function") {
      unauthorizedHandler({
        message,
        path,
        status: response.status,
      });
    }

    throw error;
  }

  return body;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function authHeaders(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export function getAssetUrl(filePath) {
  if (/^https?:\/\//.test(filePath)) {
    return filePath;
  }

  if (filePath.startsWith("/")) {
    return `${API_BASE_URL}${filePath}`;
  }

  return `${API_BASE_URL}/${filePath}`;
}

export function loginRequest(payload) {
  return request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function registerRequest(payload) {
  return request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser(token) {
  return request("/me", {
    headers: authHeaders(token),
  });
}

export function fetchSessions(token) {
  return request("/sessions", {
    headers: authHeaders(token),
  });
}

export async function fetchOpenSession(token) {
  try {
    return await request("/sessions/open", {
      headers: authHeaders(token),
    });
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function fetchSessionDetail(token, sessionId) {
  return request(`/sessions/${sessionId}`, {
    headers: authHeaders(token),
  });
}

export function createSession(token, payload) {
  return request("/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export function updateSessionSetup(token, sessionId, payload) {
  return request(`/sessions/${sessionId}/setup`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export function uploadScreenshot(token, sessionId, screenshotType, file) {
  const formData = new FormData();
  formData.append("screenshot_type", screenshotType);
  formData.append("file", file);

  return request(`/sessions/${sessionId}/upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
}

export function fetchJournalEntries(token, sessionId) {
  return request(`/sessions/${sessionId}/journal`, {
    headers: authHeaders(token),
  });
}

export function createJournalEntry(token, sessionId, content) {
  return request(`/sessions/${sessionId}/journal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ content }),
  });
}

export function fetchTradeEvents(token, sessionId) {
  return request(`/sessions/${sessionId}/trade`, {
    headers: authHeaders(token),
  });
}

export function openTrade(token, sessionId, payload) {
  return request(`/sessions/${sessionId}/trade/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export function closeTrade(token, sessionId, payload) {
  return request(`/sessions/${sessionId}/trade/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export function syncObservedTrade(token, sessionId, payload) {
  return request(`/sessions/${sessionId}/trade/observed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export function updateTradeNote(token, sessionId, tradeEventId, note) {
  return request(`/sessions/${sessionId}/trade/${tradeEventId}/note`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ note }),
  });
}

export function fetchPosition(token, sessionId) {
  return request(`/sessions/${sessionId}/position`, {
    headers: authHeaders(token),
  });
}

export function fetchScreenshots(token, sessionId) {
  return request(`/sessions/${sessionId}/screenshots`, {
    headers: authHeaders(token),
  });
}

export async function fetchLatestBrokerTelemetry(token) {
  const response = await request("/broker-telemetry/latest", {
    headers: authHeaders(token),
  });

  return response.telemetry;
}

export async function fetchBrokerSystemFeed(token, limit = 20) {
  const response = await request(`/broker-telemetry/system-feed?limit=${limit}`, {
    headers: authHeaders(token),
  });

  return response.events;
}

export async function fetchTradeEvidenceFeed(token, { limit = 20, tradingSessionId = null, brokerAdapter = null } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (tradingSessionId) {
    params.set("trading_session_id", String(tradingSessionId));
  }
  if (brokerAdapter) {
    params.set("broker_adapter", brokerAdapter);
  }

  const response = await request(`/broker-telemetry/trade-evidence?${params.toString()}`, {
    headers: authHeaders(token),
  });

  return response.events;
}

export async function fetchExtensionSessionStatus(token) {
  const response = await request("/extension-sessions/status", {
    headers: authHeaders(token),
  });

  return response.session;
}

export function endSession(token, sessionId, payload) {
  return request(`/sessions/${sessionId}/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export { API_BASE_URL };
