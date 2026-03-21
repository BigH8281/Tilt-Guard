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

    if (!previous?.trading_panel_visible && current.trading_panel_visible) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.TRADING_PANEL_VISIBLE,
          snapshot: current,
          details: { reason: "panel_root_detected" },
          ...metadata,
        }),
      );
    }

    if (!previous?.broker_connected && current.broker_connected) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.BROKER_CONNECTED,
          snapshot: current,
          details: { broker_label: current.broker_label },
          ...metadata,
        }),
      );
    }

    if (previous?.broker_connected && !current.broker_connected) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.BROKER_DISCONNECTED,
          snapshot: current,
          details: { previous_broker_label: previous.broker_label },
          ...metadata,
        }),
      );
    }

    if (previous && previous.broker_label !== current.broker_label && current.broker_label) {
      events.push(
        createEventEnvelope({
          eventType: TELEMETRY_EVENT_TYPES.BROKER_LABEL_CHANGED,
          snapshot: current,
          details: {
            previous_broker_label: previous?.broker_label || null,
            broker_label: current.broker_label,
          },
          ...metadata,
        }),
      );
    }

    const visibilityEvents = [
      ["account_manager_control_visible", TELEMETRY_EVENT_TYPES.ACCOUNT_MANAGER_CONTROL_VISIBLE],
      ["order_entry_control_visible", TELEMETRY_EVENT_TYPES.ORDER_ENTRY_CONTROL_VISIBLE],
      ["panel_open_control_visible", TELEMETRY_EVENT_TYPES.PANEL_OPEN_CONTROL_VISIBLE],
      ["panel_maximize_control_visible", TELEMETRY_EVENT_TYPES.PANEL_MAXIMIZE_CONTROL_VISIBLE],
    ];

    for (const [key, eventType] of visibilityEvents) {
      if (!previous?.[key] && current[key]) {
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

  function createTradingViewObserver({ tabId = null, onEvents }) {
    let previousSnapshot = null;
    let mutationObserver = null;
    let debounceTimer = null;
    let gapTimer = null;

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

    function flushSnapshot(reason = "mutation") {
      const { snapshot, roots } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
      metadata.pageTitle = document.title;
      metadata.pageUrl = window.location.href;

      if (previousSnapshot && snapshotsEqual(previousSnapshot, snapshot)) {
        refreshGapTimer();
        return;
      }

      const events = buildDiffEvents(previousSnapshot, snapshot, metadata);
      previousSnapshot = snapshot;
      refreshGapTimer();

      if (!events.length && reason === "manual") {
        logger.debug("snapshot_collected_without_diff", { snapshot });
        return;
      }

      logger.info("snapshot_diff_detected", {
        reason,
        snapshot,
        hasFooterCluster: Boolean(roots.footerCluster),
        eventCount: events.length,
      });

      if (events.length) {
        onEvents(events, snapshot);
      }
    }

    function scheduleFlush(reason) {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => flushSnapshot(reason), OBSERVER_CONFIG.debounceMs);
    }

    function start() {
      flushSnapshot("manual");
      mutationObserver = new MutationObserver(() => {
        scheduleFlush("mutation");
      });
      mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      refreshGapTimer();
    }

    function stop() {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      window.clearTimeout(debounceTimer);
      window.clearTimeout(gapTimer);
    }

    return { start, stop };
  }

  global.TiltGuardContent.createTradingViewObserver = createTradingViewObserver;
})(globalThis);
