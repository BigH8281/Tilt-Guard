(function attachObserver(global) {
  const {
    OBSERVER_CONFIG,
    TELEMETRY_EVENT_TYPES,
    collectDomState,
    createEventEnvelope,
    createLogger,
  } = global.TiltGuardContent;
  const logger = createLogger("content-observer");

  function snapshotsEqual(left, right) {
    // Keep emission append-only but quiet: if the normalized snapshot did not change,
    // TradingView remount noise should not create a fresh telemetry event batch.
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function buildDiffEvents(previous, current, metadata) {
    const events = [];
    const previousBroker = previous?.broker || {};
    const currentBroker = current.broker || {};
    const previousGeneric = previous?.generic || {};
    const currentGeneric = current.generic || {};

    if (!previous) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.TRADINGVIEW_TAB_DETECTED,
          snapshot: current,
          details: { reason: "initial_observation" },
          ...metadata,
        }),
      );
    }

    if (!previousGeneric.trading_panel_visible && currentGeneric.trading_panel_visible) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.TRADING_PANEL_VISIBLE,
          snapshot: current,
          details: { reason: "panel_root_detected" },
          ...metadata,
        }),
      );
    }

    if (!previousBroker.broker_connected && currentBroker.broker_connected) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.BROKER_CONNECTED,
          snapshot: current,
          details: { broker_label: currentBroker.broker_label },
          ...metadata,
        }),
      );
    }

    if (previousBroker.broker_connected && !currentBroker.broker_connected) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.BROKER_DISCONNECTED,
          snapshot: current,
          details: { previous_broker_label: previousBroker.broker_label },
          ...metadata,
        }),
      );
    }

    if (previous && previousBroker.broker_label !== currentBroker.broker_label && currentBroker.broker_label) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.BROKER_LABEL_CHANGED,
          snapshot: current,
          details: {
            previous_broker_label: previousBroker.broker_label || null,
            broker_label: currentBroker.broker_label,
          },
          ...metadata,
        }),
      );
    }

    const visibilityEvents = [
      ["account_manager_entrypoint_visible", TELEMETRY_EVENT_TYPES.ACCOUNT_MANAGER_CONTROL_VISIBLE],
      ["order_entry_control_visible", TELEMETRY_EVENT_TYPES.ORDER_ENTRY_CONTROL_VISIBLE],
      ["panel_open_control_visible", TELEMETRY_EVENT_TYPES.PANEL_OPEN_CONTROL_VISIBLE],
      ["panel_maximize_control_visible", TELEMETRY_EVENT_TYPES.PANEL_MAXIMIZE_CONTROL_VISIBLE],
    ];

    for (const [key, eventType] of visibilityEvents) {
      if (!previousGeneric[key] && currentGeneric[key]) {
        events.push(
          createEventEnvelope({
            eventType,
            snapshot: current,
            details: { control: key },
            ...metadata,
          }),
        );
      }
    }

    return events;
  }

  function getChangedSnapshotFields(previous, current) {
    if (!previous) {
      return [];
    }

    return Object.keys(current).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
  }

  function createTradingViewObserver({ tabId = null, onEvents }) {
    let previousSnapshot = null;
    let mutationObserver = null;
    let debounceTimer = null;
    let gapTimer = null;
    let heartbeatTimer = null;
    let observedRoot = null;
    let lastObservedUrl = window.location.href;

    const metadata = {
      pageTitle: document.title,
      pageUrl: window.location.href,
      tabId,
    };

    function emitObservationGap(reason) {
      const currentState = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth }).snapshot;
      const event = createEventEnvelope({
        eventType: TELEMETRY_EVENT_TYPES.OBSERVATION_GAP,
        snapshot: currentState,
        details: { reason },
        ...metadata,
      });
      onEvents([event], currentState);
    }

    function refreshGapTimer() {
      window.clearTimeout(gapTimer);
      gapTimer = window.setTimeout(() => {
        emitObservationGap("no_mutations_within_gap_window");
      }, OBSERVER_CONFIG.observationGapMs);
    }

    function attachMutationObserver() {
      const nextRoot = document.documentElement;
      if (!nextRoot || observedRoot === nextRoot) {
        return;
      }

      if (mutationObserver) {
        mutationObserver.disconnect();
      }

      mutationObserver = new MutationObserver(() => {
        scheduleFlush("mutation");
      });
      mutationObserver.observe(nextRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      observedRoot = nextRoot;
    }

    function flushSnapshot(reason = "mutation") {
      const { snapshot, roots } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
      metadata.pageTitle = document.title;
      metadata.pageUrl = window.location.href;
      lastObservedUrl = metadata.pageUrl;

      if (previousSnapshot && snapshotsEqual(previousSnapshot, snapshot)) {
        refreshGapTimer();
        return;
      }

      const events = buildDiffEvents(previousSnapshot, snapshot, metadata);
      const changedFields = getChangedSnapshotFields(previousSnapshot, snapshot);
      previousSnapshot = snapshot;
      refreshGapTimer();

      if (!events.length && reason === "manual") {
        logger.debug("snapshot_collected_without_diff", { snapshot });
        return;
      }

      if (!events.length && changedFields.length) {
        events.push(
          createEventEnvelope({
            eventType: TELEMETRY_EVENT_TYPES.OBSERVATION_GAP,
            snapshot,
            details: {
              reason: "snapshot_changed_without_specific_event",
              changed_fields: changedFields,
            },
            ...metadata,
          }),
        );
      }

      logger.info("snapshot_diff_detected", {
        reason,
        snapshot,
        hasFooterCluster: Boolean(roots.footerCluster),
        eventCount: events.length,
        changedFields,
      });

      if (events.length) {
        onEvents(events, snapshot);
      }
    }

    function scheduleFlush(reason) {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => flushSnapshot(reason), OBSERVER_CONFIG.debounceMs);
    }

    function startHeartbeat() {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        attachMutationObserver();

        if (window.location.href !== lastObservedUrl) {
          lastObservedUrl = window.location.href;
          scheduleFlush("navigation");
          return;
        }

        scheduleFlush("heartbeat");
      }, OBSERVER_CONFIG.heartbeatMs);
    }

    function start() {
      flushSnapshot("manual");
      attachMutationObserver();
      window.addEventListener("popstate", () => scheduleFlush("history"));
      window.addEventListener("hashchange", () => scheduleFlush("history"));
      window.addEventListener("focus", () => scheduleFlush("focus"));
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          scheduleFlush("visibility");
        }
      });
      startHeartbeat();
      refreshGapTimer();
    }

    function stop() {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      window.clearTimeout(debounceTimer);
      window.clearTimeout(gapTimer);
      window.clearInterval(heartbeatTimer);
    }

    return { start, stop };
  }

  global.TiltGuardContent.createTradingViewObserver = createTradingViewObserver;
})(globalThis);
