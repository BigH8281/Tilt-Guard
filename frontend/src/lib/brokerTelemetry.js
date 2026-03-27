import { useEffect, useState } from "react";

import { fetchBrokerSystemFeed, fetchExtensionSessionStatus, fetchLatestBrokerTelemetry, fetchTradeEvidenceFeed } from "./api";

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

export function useTradeEvidenceFeed(token, { limit = 12, tradingSessionId = null, brokerAdapter = null } = {}) {
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
        const nextEvents = await fetchTradeEvidenceFeed(token, {
          limit,
          tradingSessionId,
          brokerAdapter,
        });
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
  }, [brokerAdapter, limit, token, tradingSessionId]);

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

function normalizeSymbol(symbol) {
  return (symbol || "").trim().toUpperCase();
}

function toTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSameSymbol(left, right) {
  return normalizeSymbol(left?.symbol) === normalizeSymbol(right?.symbol);
}

function hasMeaningfulPlanningDetails(event) {
  return Boolean(event?.planning_tool || event?.order_type || event?.side);
}

const LOW_SIGNAL_SYSTEM_EVENT_TYPES = new Set([
  "snapshot_refreshed",
  "account_manager_control_visible",
  "order_entry_control_visible",
  "panel_open_control_visible",
  "panel_maximize_control_visible",
  "trading_panel_visible",
]);

const EVIDENCE_DISPLAY_HIDE_TYPES = new Set([
  "chart_trade_control_visible",
  "trade_ticket_opened",
]);

const PLANNING_SELECTION_EVENT_TYPES = new Set([
  "chart_long_tool_selected",
  "chart_short_tool_selected",
]);

const PLANNING_OBJECT_EVENT_TYPES = new Set([
  "chart_position_tool_placed",
  "chart_position_tool_modified",
  "chart_position_tool_removed",
]);

const ACTION_EVIDENCE_EVENT_TYPES = new Set([
  "chart_trade_buy_clicked",
  "chart_trade_sell_clicked",
  "trade_submit_clicked",
]);

const LIKELY_EXECUTION_EVENT_TYPES = new Set([
  "chart_trade_execution_unverified",
  "trade_execution_unverified",
]);

const CONFIRMED_OPEN_EVENT_TYPES = new Set(["trade_position_opened"]);
const CONFIRMED_CHANGE_EVENT_TYPES = new Set(["trade_position_changed"]);
const CONFIRMED_CLOSE_EVENT_TYPES = new Set(["trade_position_closed"]);
const CONFIRMED_POSITION_EVENT_TYPES = new Set([
  ...CONFIRMED_OPEN_EVENT_TYPES,
  ...CONFIRMED_CHANGE_EVENT_TYPES,
  ...CONFIRMED_CLOSE_EVENT_TYPES,
]);
const EPISODE_WINDOW_MS = 120_000;

function findNearbyEvent(events, index, predicate, windowMs = 8_000) {
  const reference = events[index];
  const referenceTime = toTimestamp(reference?.occurred_at);
  return events.some((candidate, candidateIndex) => {
    if (candidateIndex === index) {
      return false;
    }
    const delta = Math.abs(referenceTime - toTimestamp(candidate.occurred_at));
    return delta <= windowMs && predicate(candidate);
  });
}

export function reduceTradeEvidenceNoise(events = []) {
  return events.filter((event, index) => {
    if (EVIDENCE_DISPLAY_HIDE_TYPES.has(event.event_type)) {
      return false;
    }

    if (event.event_type === "chart_position_tool_modified") {
      return false;
    }

    if (event.event_type === "chart_position_tool_placed" && !hasMeaningfulPlanningDetails(event)) {
      const hasRicherPlacementNearby = findNearbyEvent(
        events,
        index,
        (candidate) =>
          candidate.event_type === "chart_position_tool_placed" &&
          isSameSymbol(candidate, event) &&
          hasMeaningfulPlanningDetails(candidate),
        10_000,
      );
      if (hasRicherPlacementNearby) {
        return false;
      }
    }

    const hasNearbyDuplicate = events.some((candidate, candidateIndex) => {
      if (candidateIndex >= index) {
        return false;
      }
      if (candidate.event_type !== event.event_type) {
        return false;
      }
      if (!isSameSymbol(candidate, event)) {
        return false;
      }
      const delta = Math.abs(toTimestamp(candidate.occurred_at) - toTimestamp(event.occurred_at));
      return delta <= 15_000;
    });

    return !hasNearbyDuplicate;
  });
}

export function hasLiveSessionSymbolMismatch(sessionSymbol = "", liveSymbol = "") {
  const normalizedSessionSymbol = normalizeSymbol(sessionSymbol);
  const normalizedLiveSymbol = normalizeSymbol(liveSymbol);
  return Boolean(normalizedSessionSymbol && normalizedLiveSymbol && normalizedSessionSymbol !== normalizedLiveSymbol);
}

export function scopeTradeEvidenceEvents(
  events = [],
  { tradingSessionId = null, sessionSymbol = "", liveSymbol = "" } = {},
) {
  const normalizedSessionSymbol = normalizeSymbol(sessionSymbol);
  const normalizedLiveSymbol = normalizeSymbol(liveSymbol);
  const targetSymbol = normalizedLiveSymbol || normalizedSessionSymbol;
  const hasSymbolMismatch = hasLiveSessionSymbolMismatch(sessionSymbol, liveSymbol);

  return events.filter((event) => {
    const eventSymbol = normalizeSymbol(event.symbol);
    const matchesSession = tradingSessionId != null && event.trading_session_id === tradingSessionId;

    if (!targetSymbol) {
      return matchesSession;
    }

    if (hasSymbolMismatch) {
      return eventSymbol === targetSymbol;
    }

    return matchesSession || (eventSymbol === targetSymbol && event.trading_session_id == null);
  });
}

export function reduceSystemActivityNoise(events = []) {
  const kept = [];

  for (const event of events) {
    if (LOW_SIGNAL_SYSTEM_EVENT_TYPES.has(event.event_type)) {
      continue;
    }

    const previous = kept[kept.length - 1];
    if (
      previous &&
      previous.event_type === event.event_type &&
      previous.symbol === event.symbol &&
      previous.message === event.message &&
      Math.abs(toTimestamp(previous.occurred_at) - toTimestamp(event.occurred_at)) <= 60_000
    ) {
      continue;
    }

    kept.push(event);
  }

  if (kept.length) {
    return kept;
  }

  const fallbackEvent =
    events.find((event) => event.event_type === "snapshot_refreshed") ||
    events.find((event) => !LOW_SIGNAL_SYSTEM_EVENT_TYPES.has(event.event_type)) ||
    events[0] ||
    null;

  return fallbackEvent ? [fallbackEvent] : [];
}

function inferEventSide(event) {
  if (event.side) {
    return event.side;
  }

  if (event.event_type === "chart_trade_buy_clicked" || event.event_type === "chart_long_tool_selected") {
    return "buy";
  }

  if (event.event_type === "chart_trade_sell_clicked" || event.event_type === "chart_short_tool_selected") {
    return "sell";
  }

  return event.details?.side || null;
}

function inferPlanningTool(event) {
  return (
    event.planning_tool ||
    event.details?.planning_tool ||
    (event.event_type === "chart_long_tool_selected" ? "long" : null) ||
    (event.event_type === "chart_short_tool_selected" ? "short" : null)
  );
}

function inferEventSourceSurface(event) {
  if (
    event.event_type === "chart_trade_buy_clicked" ||
    event.event_type === "chart_trade_sell_clicked" ||
    event.event_type === "chart_trade_execution_unverified" ||
    event.event_type === "chart_trade_control_visible"
  ) {
    return "chart_inline";
  }

  if (PLANNING_SELECTION_EVENT_TYPES.has(event.event_type) || PLANNING_OBJECT_EVENT_TYPES.has(event.event_type)) {
    return "chart_planning_tool";
  }

  if (
    event.event_type === "trade_ticket_opened" ||
    event.event_type === "trade_side_selected" ||
    event.event_type === "trade_order_type_detected" ||
    event.event_type === "trade_quantity_detected" ||
    event.event_type === "trade_submit_clicked" ||
    event.event_type === "trade_order_visible" ||
    event.event_type === "trade_order_cancelled"
  ) {
    return "order_ticket";
  }

  return event.details?.source_surface || "observed";
}

function inferObservedTradeSurface(event, events) {
  const eventTime = toTimestamp(event.occurred_at);
  const symbol = event.symbol || "";
  const recentRelatedEvent = events.find((candidate) => {
    if (candidate.event_id === event.event_id) {
      return false;
    }
    if ((candidate.symbol || "") !== symbol) {
      return false;
    }
    const delta = eventTime - toTimestamp(candidate.occurred_at);
    return delta >= 0 && delta <= 20_000;
  });

  if (!recentRelatedEvent) {
    return inferEventSourceSurface(event);
  }

  return inferEventSourceSurface(recentRelatedEvent);
}

function matchesManualTrade(manualTradeEvents, observedTrade) {
  return manualTradeEvents.some((tradeEvent) => {
    if (tradeEvent.event_type !== observedTrade.event_type) {
      return false;
    }

    const delta = Math.abs(toTimestamp(tradeEvent.event_time) - toTimestamp(observedTrade.event_time));
    if (delta > 120_000) {
      return false;
    }

    if (observedTrade.direction && tradeEvent.direction && observedTrade.direction !== tradeEvent.direction) {
      return false;
    }

    if (observedTrade.size && tradeEvent.size && observedTrade.size !== tradeEvent.size) {
      return false;
    }

    if (observedTrade.symbol && tradeEvent.symbol && observedTrade.symbol !== tradeEvent.symbol) {
      return false;
    }

    return true;
  });
}

function canMergeIntoEpisode(episode, event) {
  const eventTime = toTimestamp(event.occurred_at);
  const lastEventTime = toTimestamp(episode.last_event_at);
  if (eventTime < lastEventTime || eventTime - lastEventTime > EPISODE_WINDOW_MS) {
    return false;
  }

  if (episode.symbol && event.symbol && episode.symbol !== event.symbol) {
    return false;
  }

  const eventSide = inferEventSide(event);
  if (episode.side && eventSide && episode.side !== eventSide) {
    return false;
  }

  if (episode.has_confirmed_close) {
    return false;
  }

  if (
    (episode.has_confirmed_open || episode.has_confirmed_close || episode.has_confirmed_position_change) &&
    CONFIRMED_POSITION_EVENT_TYPES.has(event.event_type)
  ) {
    return false;
  }

  if (
    episode.has_confirmed_open &&
    (ACTION_EVIDENCE_EVENT_TYPES.has(event.event_type) ||
      PLANNING_SELECTION_EVENT_TYPES.has(event.event_type) ||
      PLANNING_OBJECT_EVENT_TYPES.has(event.event_type))
  ) {
    return false;
  }

  return true;
}

function createEpisodeFromEvent(event) {
  return {
    episode_id: `episode-${event.event_id}`,
    event_ids: [],
    event_types: [],
    source_surfaces: [],
    symbol: event.symbol || null,
    side: inferEventSide(event),
    order_type: event.order_type || event.details?.order_type || null,
    quantity: event.quantity ?? event.details?.quantity ?? null,
    price: event.price ?? event.details?.price ?? null,
    planning_tool: inferPlanningTool(event),
    started_at: event.occurred_at,
    last_event_at: event.occurred_at,
    max_confidence: Number(event.confidence || 0),
    evidence_stage: event.evidence_stage || "intent_observed",
    has_planning_selection: false,
    has_planning_placement: false,
    has_planning_removal: false,
    has_trade_action: false,
    has_execution_likely: false,
    has_confirmed_open: false,
    has_confirmed_position_change: false,
    has_confirmed_close: false,
    previous_confirmed_quantity: null,
    current_confirmed_quantity: null,
    previous_confirmed_side: null,
    current_confirmed_side: null,
    position_delta_quantity: null,
  };
}

function updateEpisodeFromEvent(episode, event) {
  episode.event_ids.push(event.event_id);
  episode.event_types.push(event.event_type);
  episode.last_event_at = event.occurred_at;
  episode.max_confidence = Math.max(episode.max_confidence, Number(event.confidence || 0));
  episode.evidence_stage = event.evidence_stage || episode.evidence_stage;

  if (!episode.symbol && event.symbol) {
    episode.symbol = event.symbol;
  }

  const side = inferEventSide(event);
  if (!episode.side && side) {
    episode.side = side;
  }

  if (!episode.order_type && (event.order_type || event.details?.order_type)) {
    episode.order_type = event.order_type || event.details?.order_type;
  }

  if (episode.quantity == null && (event.quantity ?? event.details?.quantity) != null) {
    episode.quantity = event.quantity ?? event.details?.quantity;
  }

  if (episode.price == null && (event.price ?? event.details?.price) != null) {
    episode.price = event.price ?? event.details?.price;
  }

  const planningTool = inferPlanningTool(event);
  if (!episode.planning_tool && planningTool) {
    episode.planning_tool = planningTool;
  }

  const sourceSurface = inferEventSourceSurface(event);
  if (!episode.source_surfaces.includes(sourceSurface)) {
    episode.source_surfaces.push(sourceSurface);
  }

  if (PLANNING_SELECTION_EVENT_TYPES.has(event.event_type)) {
    episode.has_planning_selection = true;
  }

  if (event.event_type === "chart_position_tool_placed") {
    episode.has_planning_placement = true;
  }

  if (event.event_type === "chart_position_tool_removed") {
    episode.has_planning_removal = true;
  }

  if (ACTION_EVIDENCE_EVENT_TYPES.has(event.event_type)) {
    episode.has_trade_action = true;
  }

  if (LIKELY_EXECUTION_EVENT_TYPES.has(event.event_type)) {
    episode.has_execution_likely = true;
  }

  if (CONFIRMED_OPEN_EVENT_TYPES.has(event.event_type)) {
    episode.has_confirmed_open = true;
    if (episode.previous_confirmed_quantity == null) {
      episode.previous_confirmed_quantity = event.details?.previous_position_size ?? 0;
    }
    episode.current_confirmed_quantity = event.details?.current_position_size ?? event.quantity ?? event.details?.quantity ?? null;
    episode.previous_confirmed_side = event.details?.previous_position_side || null;
    episode.current_confirmed_side = event.details?.current_position_side || side || null;
    if (episode.position_delta_quantity == null) {
      episode.position_delta_quantity =
        event.details?.position_delta_quantity ??
        (event.details?.current_position_size ?? event.quantity ?? event.details?.quantity ?? 0) -
          (event.details?.previous_position_size ?? 0);
    }
  }

  if (CONFIRMED_CHANGE_EVENT_TYPES.has(event.event_type)) {
    episode.has_confirmed_position_change = true;
    episode.previous_confirmed_quantity = event.details?.previous_position_size ?? episode.previous_confirmed_quantity;
    episode.current_confirmed_quantity = event.details?.current_position_size ?? event.quantity ?? event.details?.quantity ?? episode.current_confirmed_quantity;
    episode.previous_confirmed_side = event.details?.previous_position_side || episode.previous_confirmed_side;
    episode.current_confirmed_side = event.details?.current_position_side || side || episode.current_confirmed_side;
    episode.position_delta_quantity =
      event.details?.position_delta_quantity ??
      ((event.details?.current_position_size ?? event.quantity ?? event.details?.quantity ?? 0) -
        (event.details?.previous_position_size ?? 0));
  }

  if (CONFIRMED_CLOSE_EVENT_TYPES.has(event.event_type)) {
    episode.has_confirmed_close = true;
    episode.previous_confirmed_quantity =
      event.details?.previous_position_size ?? event.quantity ?? event.details?.quantity ?? episode.previous_confirmed_quantity;
    episode.current_confirmed_quantity = event.details?.current_position_size ?? 0;
    episode.previous_confirmed_side = event.details?.previous_position_side || side || episode.previous_confirmed_side;
    episode.current_confirmed_side = event.details?.current_position_side || null;
    if (episode.position_delta_quantity == null) {
      episode.position_delta_quantity =
        event.details?.position_delta_quantity ??
        ((event.details?.current_position_size ?? 0) -
          (event.details?.previous_position_size ?? event.quantity ?? event.details?.quantity ?? 0));
    }
  }
}

function summarizeEpisode(episode) {
  if (episode.has_confirmed_close) {
    return {
      episode_type: "position_close_confirmed",
      summary: "Position close confirmed",
      evidence_stage: "execution_confirmed",
      confidence: Math.max(episode.max_confidence, 0.92),
      journal_eligible: true,
    };
  }

  if (episode.has_confirmed_position_change) {
    const previousQuantity = Number.isFinite(episode.previous_confirmed_quantity)
      ? episode.previous_confirmed_quantity
      : null;
    const currentQuantity = Number.isFinite(episode.current_confirmed_quantity)
      ? episode.current_confirmed_quantity
      : null;
    const previousSide = episode.previous_confirmed_side || null;
    const currentSide = episode.current_confirmed_side || episode.side || null;
    const positionDeltaQuantity = Number.isFinite(episode.position_delta_quantity)
      ? episode.position_delta_quantity
      : previousQuantity != null && currentQuantity != null
        ? currentQuantity - previousQuantity
        : null;

    if (previousSide && currentSide && previousSide !== currentSide) {
      return {
        episode_type: "position_flip_or_reopen_ambiguous",
        summary: "Position flip or reopen ambiguous",
        evidence_stage: "execution_confirmed",
        confidence: Math.max(episode.max_confidence, 0.72),
        journal_eligible: false,
        delta_quantity: positionDeltaQuantity != null ? Math.abs(positionDeltaQuantity) : null,
      };
    }

    if (positionDeltaQuantity != null && positionDeltaQuantity > 0) {
      return {
        episode_type: "position_add_confirmed",
        summary: "Position add confirmed",
        evidence_stage: "execution_confirmed",
        confidence: Math.max(episode.max_confidence, 0.88),
        journal_eligible: true,
        delta_quantity: positionDeltaQuantity,
      };
    }

    if (positionDeltaQuantity != null && positionDeltaQuantity < 0) {
      return {
        episode_type: "position_reduce_confirmed",
        summary: "Position reduce confirmed",
        evidence_stage: "execution_confirmed",
        confidence: Math.max(episode.max_confidence, 0.88),
        journal_eligible: true,
        delta_quantity: Math.abs(positionDeltaQuantity),
      };
    }
  }

  if (episode.has_confirmed_open) {
    return {
      episode_type: "position_open_confirmed",
      summary: "Position open confirmed",
      evidence_stage: "execution_confirmed",
      confidence: Math.max(episode.max_confidence, 0.92),
      journal_eligible: true,
    };
  }

  if (episode.has_execution_likely) {
    return {
      episode_type: "trade_execution_likely",
      summary: "Trade execution likely",
      evidence_stage: "execution_likely",
      confidence: Math.max(episode.max_confidence, 0.68),
      journal_eligible: false,
    };
  }

  if (episode.has_planning_placement && episode.has_planning_removal) {
    return {
      episode_type: "abandoned_trade_attempt",
      summary: "Trade attempt abandoned",
      evidence_stage: "intent_observed",
      confidence: Math.max(episode.max_confidence, 0.42),
      journal_eligible: false,
    };
  }

  if (episode.has_planning_placement) {
    return {
      episode_type: "trade_order_placement_likely",
      summary: "Trade order placement likely",
      evidence_stage: "intent_observed",
      confidence: Math.max(episode.max_confidence, 0.48),
      journal_eligible: false,
    };
  }

  if (episode.has_trade_action) {
    return {
      episode_type: "trade_entry_attempt_observed",
      summary: "Trade entry attempt observed",
      evidence_stage: "intent_observed",
      confidence: Math.max(episode.max_confidence, 0.58),
      journal_eligible: false,
    };
  }

  if (episode.has_planning_selection) {
    return {
      episode_type: "planning_intent_observed",
      summary: "Planning intent observed",
      evidence_stage: "intent_observed",
      confidence: Math.max(episode.max_confidence, 0.34),
      journal_eligible: false,
    };
  }

  return {
    episode_type: "trade_episode_incomplete",
    summary: "Observed trade episode incomplete",
    evidence_stage: episode.evidence_stage || "intent_observed",
    confidence: Math.max(episode.max_confidence, 0.25),
    journal_eligible: false,
  };
}

export function deriveTradeEvidenceEpisodes(events = []) {
  const chronologicalEvents = [...events].sort((left, right) => toTimestamp(left.occurred_at) - toTimestamp(right.occurred_at));
  const episodes = [];

  for (const event of chronologicalEvents) {
    let matchingEpisode = null;
    for (let index = episodes.length - 1; index >= 0; index -= 1) {
      if (canMergeIntoEpisode(episodes[index], event)) {
        matchingEpisode = episodes[index];
        break;
      }
    }

    if (!matchingEpisode) {
      matchingEpisode = createEpisodeFromEvent(event);
      episodes.push(matchingEpisode);
    }

    updateEpisodeFromEvent(matchingEpisode, event);
  }

  return episodes
    .map((episode) => ({
      ...episode,
      ...summarizeEpisode(episode),
      primary_source_surface:
        episode.source_surfaces[0] ||
        (episode.has_planning_selection || episode.has_planning_placement ? "chart_planning_tool" : "observed"),
    }))
    .sort((left, right) => toTimestamp(right.last_event_at) - toTimestamp(left.last_event_at));
}

export function deriveObservedTradeJournalEntries(episodes = [], manualTradeEvents = [], { sessionSymbol = "" } = {}) {
  const normalizedSessionSymbol = normalizeSymbol(sessionSymbol);
  const observedTradeEntries = episodes
    .filter((episode) => episode.journal_eligible)
    .map((episode) => {
      const eventType =
        episode.episode_type === "position_close_confirmed"
          ? "CLOSE"
          : episode.episode_type === "position_add_confirmed"
            ? "ADD"
            : episode.episode_type === "position_reduce_confirmed"
              ? "REDUCE"
              : "OPEN";
      const sourceSurface = episode.primary_source_surface;
      const symbol = episode.symbol || null;
      const normalizedTradeSymbol = normalizeSymbol(symbol);
      const symbolMismatch = Boolean(
        normalizedSessionSymbol && normalizedTradeSymbol && normalizedSessionSymbol !== normalizedTradeSymbol,
      );
      const size =
        Number.isFinite(episode.delta_quantity) && (eventType === "ADD" || eventType === "REDUCE")
          ? Math.max(1, Math.round(episode.delta_quantity))
          : Number.isFinite(episode.quantity)
            ? Math.max(1, Math.round(episode.quantity))
            : 1;

      return {
        id: `observed-${episode.episode_id}`,
        observed_episode_id: episode.episode_id,
        source: "observed",
        event_type: eventType,
        direction: episode.side || null,
        size,
        result_gbp: null,
        note: null,
        event_time: episode.last_event_at,
        confidence: episode.confidence,
        symbol,
        session_symbol: sessionSymbol || null,
        symbol_mismatch: symbolMismatch,
        source_surface: sourceSurface,
        reflection_pending: true,
      };
    });

  return observedTradeEntries.filter((entry) => !matchesManualTrade(manualTradeEvents, entry));
}
