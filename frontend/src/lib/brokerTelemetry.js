import { useEffect, useState } from "react";

import { fetchBrokerSystemFeed, fetchExtensionSessionStatus, fetchLatestBrokerTelemetry } from "./api";

const AUTO_REFRESH_MS = 5000;

function logTelemetryEvent(level, event, details = {}) {
  const logger = console[level] ?? console.info;
  logger("[BrokerTelemetry]", {
    event,
    ...details,
  });
}

export function useLatestBrokerTelemetry(token) {
  const [telemetry, setTelemetry] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLatest(mode = "initial") {
      if (!token) {
        if (!cancelled) {
          setTelemetry(null);
          setError("");
          setIsLoading(false);
          setIsRefreshing(false);
        }
        return;
      }

      if (!cancelled) {
        if (mode === "initial") {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }
      }

      try {
        const latest = await fetchLatestBrokerTelemetry(token);
        if (!cancelled) {
          setTelemetry(latest);
          setError("");
        }
        logTelemetryEvent("info", "telemetry_load_succeeded", {
          mode,
          hasTelemetry: Boolean(latest),
          status: latest?.status ?? null,
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
        logTelemetryEvent("warn", "telemetry_load_failed", {
          mode,
          message: loadError.message,
          status: loadError.status ?? null,
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    loadLatest("initial");
    const intervalId = window.setInterval(() => {
      loadLatest("refresh");
    }, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  async function refresh() {
    if (!token) {
      return;
    }

    setIsRefreshing(true);
    try {
      const latest = await fetchLatestBrokerTelemetry(token);
      setTelemetry(latest);
      setError("");
      logTelemetryEvent("info", "telemetry_refresh_succeeded", {
        hasTelemetry: Boolean(latest),
        status: latest?.status ?? null,
      });
    } catch (loadError) {
      setError(loadError.message);
      logTelemetryEvent("warn", "telemetry_refresh_failed", {
        message: loadError.message,
        status: loadError.status ?? null,
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  return {
    telemetry,
    error,
    isLoading,
    isRefreshing,
    refresh,
  };
}

export function useExtensionSessionStatus(token) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(mode = "initial") {
      if (!token) {
        if (!cancelled) {
          setSession(null);
          setError("");
          setIsLoading(false);
          setIsRefreshing(false);
        }
        return;
      }

      if (!cancelled) {
        if (mode === "initial") {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }
      }

      try {
        const nextSession = await fetchExtensionSessionStatus(token);
        if (!cancelled) {
          setSession(nextSession);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    load("initial");
    const intervalId = window.setInterval(() => {
      load("refresh");
    }, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  async function refresh() {
    if (!token) {
      return;
    }

    setIsRefreshing(true);
    try {
      const nextSession = await fetchExtensionSessionStatus(token);
      setSession(nextSession);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  return {
    session,
    error,
    isLoading,
    isRefreshing,
    refresh,
  };
}

export function useBrokerSystemFeed(token, limit = 20) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        if (!cancelled) {
          setEvents([]);
          setError("");
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextEvents = await fetchBrokerSystemFeed(token, limit);
        if (!cancelled) {
          setEvents(nextEvents);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    const intervalId = window.setInterval(load, AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [limit, token]);

  return {
    events,
    error,
    isLoading,
  };
}

export function formatTelemetryFreshness(telemetry) {
  if (!telemetry) {
    return "No recent telemetry";
  }

  const seconds = telemetry.freshness_seconds;
  if (seconds < 10) {
    return "Updated just now";
  }

  if (seconds < 60) {
    return `Updated ${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `Updated ${hours}h ago`;
}

export function getTelemetryStatusCopy(telemetry) {
  if (!telemetry) {
    return {
      label: "Unavailable",
      description: "No recent TradingView broker telemetry found for this account.",
      tone: "offline",
    };
  }

  if (telemetry.status === "live") {
    return {
      label: "Live",
      description: "TradingView telemetry is fresh and the broker is connected.",
      tone: "live",
    };
  }

  if (telemetry.status === "attention") {
    const isFresh = telemetry.is_fresh;
    const hasConnectedBroker = telemetry.snapshot?.broker?.broker_connected;
    return {
      label: "Attention",
      description:
        isFresh && hasConnectedBroker
          ? "Telemetry is fresh, but some live chart details are still settling after a reload."
          : isFresh
            ? "Telemetry is fresh, but the broker connection is still being confirmed."
            : "Telemetry exists, but it is stale or only partially connected.",
      tone: "attention",
    };
  }

  return {
    label: "Offline",
    description: "Telemetry is stale or unavailable right now.",
    tone: "offline",
  };
}

export function getUnifiedMonitoringStatusCopy(extensionSession, telemetry) {
  if (extensionSession) {
    return getExtensionSessionStatusCopy(extensionSession);
  }

  return getTelemetryStatusCopy(telemetry);
}

export function getExtensionSessionStatusCopy(session) {
  if (!session) {
    return {
      label: "Disconnected",
      description: "No extension heartbeat has reached Tilt-Guard yet.",
      tone: "offline",
    };
  }

  if (session.status === "live" && session.monitoring_state === "active") {
    return {
      label: "Live",
      description: "The extension is connected, TradingView is detected, and monitoring is live.",
      tone: "live",
    };
  }

  if (session.status === "live" && session.monitoring_state === "stale") {
    const isBackgrounded =
      session.status_payload?.document_hidden || session.status_payload?.visibility_state === "hidden";
    return {
      label: "Stale",
      description: isBackgrounded
        ? "The extension is still connected, but the TradingView chart is currently backgrounded."
        : "The extension is still connected, but TradingView observation is temporarily degraded.",
      tone: "attention",
    };
  }

  if (session.status === "live") {
    return {
      label: "Connected",
      description: "The extension is connected, but monitoring is still warming up or partially matched.",
      tone: "attention",
    };
  }

  if (session.status === "attention") {
    return {
      label: "Disconnected",
      description: "Tilt-Guard recently lost an active extension heartbeat, so observation may be interrupted.",
      tone: "attention",
    };
  }

  return {
    label: "Offline",
    description: "Tilt-Guard has not heard from the extension recently.",
    tone: "offline",
  };
}

export function getLiveSymbol(extensionSession, telemetry, fallback = "") {
  return (
    extensionSession?.status_payload?.symbol ||
    telemetry?.symbol ||
    telemetry?.snapshot?.generic?.current_symbol ||
    fallback ||
    ""
  );
}

export function getLiveAccountName(extensionSession, telemetry, fallback = "") {
  return (
    extensionSession?.status_payload?.account_name ||
    telemetry?.account_name ||
    telemetry?.snapshot?.broker?.current_account_name ||
    fallback ||
    ""
  );
}

export function getLiveBrokerLabel(extensionSession, telemetry, fallback = "") {
  return (
    extensionSession?.broker_profile ||
    telemetry?.snapshot?.broker?.broker_label ||
    telemetry?.broker_adapter?.toUpperCase() ||
    fallback ||
    ""
  );
}
