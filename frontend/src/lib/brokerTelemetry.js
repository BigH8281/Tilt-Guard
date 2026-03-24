import { useEffect, useState } from "react";

import { fetchLatestBrokerTelemetry } from "./api";

const AUTO_REFRESH_MS = 15000;

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
