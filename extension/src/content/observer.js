(function attachObserver(global) {
  const {
    OBSERVER_CONFIG,
    TELEMETRY_EVENT_TYPES,
    collectDomState,
    buildSnapshotRefreshDetails,
    createEventEnvelope,
    createLogger,
    getTradingViewPageMatch,
    shouldEmitSnapshotRefresh,
  } = global.TiltGuardContent;
  const { resolveAdapterMatch } = global.TiltGuardShared;
  const logger = createLogger("content-observer");

  function snapshotsEqual(left, right) {
    // Keep emission append-only but quiet: if the normalized snapshot did not change,
    // TradingView remount noise should not create a fresh telemetry event batch.
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function buildDiffEvents(previous, current, metadata, adapter) {
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
          brokerAdapter: adapter.id,
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
          brokerAdapter: adapter.id,
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
          brokerAdapter: adapter.id,
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
          brokerAdapter: adapter.id,
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
          brokerAdapter: adapter.id,
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
            brokerAdapter: adapter.id,
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
    let lastObservedTitle = document.title;
    let lastRefreshEventAt = 0;

    const metadata = {
      pageTitle: document.title,
      pageUrl: window.location.href,
      tabId,
    };

    function emitObservationGap(reason) {
      const currentState = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth }).snapshot;
      const adapter = resolveAdapterMatch({
        snapshot: currentState,
        pageContext: getTradingViewPageMatch(window.location),
      });
      const event = createEventEnvelope({
        eventType: TELEMETRY_EVENT_TYPES.OBSERVATION_GAP,
        snapshot: currentState,
        details: { reason },
        brokerAdapter: adapter.id,
        ...metadata,
      });
      onEvents([event], currentState, adapter);
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
      const adapter = resolveAdapterMatch({
        snapshot,
        pageContext: getTradingViewPageMatch(window.location),
      });
      const previousPageTitle = metadata.pageTitle;
      const previousPageUrl = metadata.pageUrl;
      const previousSymbol = previousSnapshot?.generic?.current_symbol || null;
      const previousTradingPanelVisible = previousSnapshot?.generic?.trading_panel_visible || false;
      metadata.pageTitle = document.title;
      metadata.pageUrl = window.location.href;
      lastObservedUrl = metadata.pageUrl;
      lastObservedTitle = metadata.pageTitle;
      const changedFields = getChangedSnapshotFields(previousSnapshot, snapshot);
      const symbolChanged = previousSymbol !== (snapshot.generic?.current_symbol || null);
      const titleChanged = previousPageTitle !== metadata.pageTitle;
      const urlChanged = previousPageUrl !== metadata.pageUrl;
      const tradingPanelStateChanged =
        previousTradingPanelVisible !== Boolean(snapshot.generic?.trading_panel_visible);
      const shouldEmitRefresh = shouldEmitSnapshotRefresh({
        reason,
        documentHidden: document.hidden,
        lastRefreshEventAt,
        refreshIntervalMs: OBSERVER_CONFIG.snapshotRefreshMs,
        symbolChanged,
        titleChanged,
        urlChanged,
        tradingPanelStateChanged,
      });

      if (previousSnapshot && snapshotsEqual(previousSnapshot, snapshot) && !shouldEmitRefresh) {
        refreshGapTimer();
        return;
      }

      const events = buildDiffEvents(previousSnapshot, snapshot, metadata, adapter);
      previousSnapshot = snapshot;
      refreshGapTimer();

      if (shouldEmitRefresh) {
        events.push(
          createEventEnvelope({
            eventType: TELEMETRY_EVENT_TYPES.SNAPSHOT_REFRESHED,
            snapshot,
            details: buildSnapshotRefreshDetails({
              reason,
              changedFields,
              previousSymbol,
              currentSymbol: snapshot.generic?.current_symbol || null,
              previousPageTitle,
              pageTitle: metadata.pageTitle,
              previousPageUrl,
              pageUrl: metadata.pageUrl,
              tradingPanelStateChanged,
            }),
            brokerAdapter: adapter.id,
            ...metadata,
          }),
        );
        lastRefreshEventAt = Date.now();
      }

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
              adapter_id: adapter.id,
            },
            brokerAdapter: adapter.id,
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
        adapterId: adapter.id,
        adapterConfidence: adapter.confidence,
      });

      if (events.length) {
        onEvents(events, snapshot, adapter);
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
          flushSnapshot("navigation");
          return;
        }

        if (document.title !== lastObservedTitle) {
          lastObservedTitle = document.title;
          flushSnapshot("title");
          return;
        }

        if (document.hidden) {
          return;
        }

        flushSnapshot("heartbeat");
      }, OBSERVER_CONFIG.heartbeatMs);
    }

    function start() {
      flushSnapshot("manual");
      attachMutationObserver();
      window.addEventListener("popstate", () => scheduleFlush("history"));
      window.addEventListener("hashchange", () => scheduleFlush("history"));
      window.addEventListener("focus", () => scheduleFlush("focus"));
      window.addEventListener("pageshow", () => scheduleFlush("pageshow"));
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
