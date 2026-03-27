(function attachObserver(global) {
  const {
    OBSERVER_CONFIG,
    TELEMETRY_EVENT_TYPES,
    buildTradeEvidenceEvents,
    collectDomState,
    createTradeEvidenceEvent,
    createTradeEvidenceDeduper,
    buildSnapshotRefreshDetails,
    createEventEnvelope,
    createLogger,
    detectTradeInputEvents,
    detectTradeInteractionEvents,
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
    let followupFlushTimers = [];
    let gapTimer = null;
    let heartbeatTimer = null;
    let observedRoot = null;
    let lastObservedUrl = window.location.href;
    let lastObservedTitle = document.title;
    let lastRefreshEventAt = 0;
    let recentChartExecutionNotification = null;
    const tradeEvidenceDeduper = createTradeEvidenceDeduper();
    const planningPlacements = new Map();
    const planningSelection = {
      tool: null,
      selectedAt: 0,
    };

    const metadata = {
      pageTitle: document.title,
      pageUrl: window.location.href,
      tabId,
    };
    const interactionDebugEnabled = window.localStorage.getItem("__tiltguard_chart_debug__") === "1";

    function emitInteractionDebug(eventName, detail = {}) {
      if (!interactionDebugEnabled) {
        return;
      }

      const payload = {
        eventName,
        ts: new Date().toISOString(),
        ...detail,
      };
      logger.info("chart_interaction_debug", payload);
      window.dispatchEvent(new CustomEvent("__tiltguard_chart_debug__", { detail: payload }));
    }

    function getSymbolPlanningState(symbol) {
      if (!symbol) {
        return null;
      }
      return planningPlacements.get(symbol) || null;
    }

    function hasActivePlanningSelection() {
      return Boolean(planningSelection.tool && Date.now() - planningSelection.selectedAt <= 30_000);
    }

    function clearPlanningSelection() {
      planningSelection.tool = null;
      planningSelection.selectedAt = 0;
    }

    function updatePlanningStateFromEvents(events, snapshot) {
      const symbol = snapshot?.generic?.current_symbol || null;
      for (const event of events) {
        if (event.event_type === TELEMETRY_EVENT_TYPES.CHART_LONG_TOOL_SELECTED) {
          planningSelection.tool = "long";
          planningSelection.selectedAt = Date.now();
        }
        if (event.event_type === TELEMETRY_EVENT_TYPES.CHART_SHORT_TOOL_SELECTED) {
          planningSelection.tool = "short";
          planningSelection.selectedAt = Date.now();
        }
        if (event.event_type === TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_REMOVED) {
          if (symbol) {
            planningPlacements.delete(symbol);
          }
          clearPlanningSelection();
        }
      }
    }

    function createPlanningPlacementEvent({ snapshot, adapter, eventType, tool, symbol, placementCount }) {
      return createTradeEvidenceEvent({
        eventType,
        snapshot,
        metadata,
        adapter,
        rawSignalSummary:
          eventType === TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_PLACED
            ? `chart ${tool} position tool placed${symbol ? ` on ${symbol}` : ""}`
            : `chart ${tool} position tool modified${symbol ? ` on ${symbol}` : ""}`,
        overrides: {
          side: tool === "short" ? "sell" : "buy",
          sourceSurface: "chart_planning_tool",
          planningTool: tool,
          quantity: placementCount > 0 ? placementCount : null,
        },
      });
    }

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

      mutationObserver = new MutationObserver((mutations) => {
        captureChartExecutionNotificationFromMutations(mutations);
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

    function normalizeNotificationText(text) {
      return String(text || "")
        .replace(/\s+/g, " ")
        .replace(/\b(Close)(Buy|Sell|Long|Short)\b/gi, "$1 $2")
        .replace(
          /\b((?:[A-Z0-9_]+:)?[A-Z0-9._!/-]{2,20})(Close)\s?(Buy|Sell|Long|Short)\b/g,
          "$1 $2 $3",
        )
        .replace(/\b((?:[A-Z0-9_]+:)?[A-Z0-9._!/-]{2,20})(Buy|Sell|Long|Short)\b/g, "$1 $2")
        .trim();
    }

    function parseNotificationNumber(value) {
      const normalized = String(value || "").replace(/,/g, "");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function parseChartExecutionNotificationText(text, currentSymbol) {
      const normalizedText = normalizeNotificationText(text);
      if (!normalizedText || !/\border executed\b/i.test(normalizedText)) {
        return null;
      }

      const symbolMatch = normalizedText.match(/\bon\s+([A-Z0-9._-]+:[A-Z0-9._-]+)/i);
      const rawSymbol = symbolMatch ? symbolMatch[1] : currentSymbol || null;
      const symbol = rawSymbol?.includes(":") ? rawSymbol.split(":").pop() : rawSymbol;
      const closeMatch = normalizedText.match(/\bclose\s+(buy|sell)\s+([\d,]+)/i);
      const openMatch = normalizedText.match(/\b(buy|sell)\s+([\d,]+)/i);
      const quantityMatch = closeMatch || openMatch;
      const side = (closeMatch?.[1] || openMatch?.[1] || "").toLowerCase() || null;
      const quantity = parseNotificationNumber(quantityMatch?.[2] || null);
      const priceMatch = normalizedText.match(/\bat\s+([0-9]+(?:\.[0-9]+)?)/i);
      const price = parseNotificationNumber(priceMatch?.[1] || null);

      if (!side || !quantity) {
        return null;
      }

      return {
        visible: true,
        summary: normalizedText,
        symbol: symbol || currentSymbol || null,
        side,
        quantity,
        price,
        orderType: /\bmarket order\b/i.test(normalizedText) ? "market" : null,
        observedAt: Date.now(),
      };
    }

    function getRecentChartExecutionNotification() {
      if (!recentChartExecutionNotification) {
        return null;
      }

      if (Date.now() - recentChartExecutionNotification.observedAt > 15_000) {
        recentChartExecutionNotification = null;
        return null;
      }

      return recentChartExecutionNotification;
    }

    function captureChartExecutionNotificationFromMutations(mutations) {
      const currentSymbol = previousSnapshot?.generic?.current_symbol || null;
      const texts = [];

      for (const mutation of mutations) {
        if (mutation.target?.textContent) {
          texts.push(mutation.target.textContent);
        }

        for (const node of mutation.addedNodes || []) {
          if (node.nodeType === Node.TEXT_NODE) {
            texts.push(node.textContent || "");
            continue;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            texts.push(node.textContent || "");
            if (node.parentElement?.textContent) {
              texts.push(node.parentElement.textContent);
            }
          }
        }
      }

      for (const text of texts) {
        const parsed = parseChartExecutionNotificationText(text, currentSymbol);
        if (parsed) {
          recentChartExecutionNotification = parsed;
        }
      }
    }

    function mergeRecentChartExecutionNotification(snapshot) {
      const cachedNotification = getRecentChartExecutionNotification();
      if (!cachedNotification || snapshot?.trade?.chart_position_notification_summary) {
        return snapshot;
      }

      return {
        ...snapshot,
        trade: {
          ...snapshot.trade,
          chart_position_notification_visible: true,
          chart_position_notification_summary: cachedNotification.summary,
          chart_position_notification_symbol: cachedNotification.symbol,
          chart_position_notification_side: cachedNotification.side,
          chart_position_notification_quantity: cachedNotification.quantity,
          chart_position_notification_price: cachedNotification.price,
          chart_position_notification_order_type: cachedNotification.orderType,
          chart_position_support_active: true,
          chart_position_support_summary:
            snapshot.trade.chart_position_support_summary || cachedNotification.summary,
        },
      };
    }

    function flushSnapshot(reason = "mutation") {
      const { snapshot: rawSnapshot, roots } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
      const snapshot = mergeRecentChartExecutionNotification(rawSnapshot);
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
      events.push(...buildTradeEvidenceEvents(previousSnapshot, snapshot, metadata, adapter));
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

      const filteredEvents = tradeEvidenceDeduper.filter(events);
      if (filteredEvents.length) {
        onEvents(filteredEvents, snapshot, adapter);
      }
    }

    function scheduleFlush(reason) {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => flushSnapshot(reason), OBSERVER_CONFIG.debounceMs);
    }

    function scheduleFollowupFlush(reason = "post_trade_interaction") {
      for (const timer of followupFlushTimers) {
        window.clearTimeout(timer);
      }
      followupFlushTimers = [120, 400, 900].map((delayMs) =>
        window.setTimeout(() => flushSnapshot(reason), delayMs),
      );
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
      function getInteractionTarget(event) {
        return event.target instanceof Element ? event.target.closest("button, [role='button'], [data-name]") : null;
      }

      function emitInteractionEvents(target, sourceEventType) {
        if (!target) {
          return;
        }

        const { snapshot } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
        const adapter = resolveAdapterMatch({
          snapshot,
          pageContext: getTradingViewPageMatch(window.location),
        });
        metadata.pageTitle = document.title;
        metadata.pageUrl = window.location.href;
        const events = tradeEvidenceDeduper.filter(
          detectTradeInteractionEvents(target, snapshot, metadata, adapter, {
            activePlanningTool: planningSelection.tool,
            hasPlacedPlanningTool: Boolean(getSymbolPlanningState(snapshot?.generic?.current_symbol || null)),
          }),
        );
        emitInteractionDebug("interaction_detected", {
          sourceEventType,
          targetLabel:
            target.getAttribute?.("aria-label") ||
            target.getAttribute?.("title") ||
            target.getAttribute?.("data-name") ||
            target.textContent?.trim() ||
            "",
          eventTypes: events.map((event) => event.event_type),
        });
        updatePlanningStateFromEvents(events, snapshot);
        if (events.length) {
          onEvents(events, snapshot, adapter);
          if (
            events.some((event) =>
              [
                TELEMETRY_EVENT_TYPES.CHART_TRADE_BUY_CLICKED,
                TELEMETRY_EVENT_TYPES.CHART_TRADE_SELL_CLICKED,
                TELEMETRY_EVENT_TYPES.TRADE_SUBMIT_CLICKED,
              ].includes(event.event_type),
            )
          ) {
            scheduleFollowupFlush();
          }
        }
      }

      document.addEventListener(
        "pointerdown",
        (event) => {
          const target = getInteractionTarget(event);
          if (!target) {
            return;
          }

          emitInteractionEvents(target, "pointerdown");
        },
        true,
      );
      document.addEventListener(
        "click",
        (event) => {
          emitInteractionEvents(getInteractionTarget(event), "click");
        },
        true,
      );
      document.addEventListener(
        "pointerup",
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target || !hasActivePlanningSelection()) {
            return;
          }

          const chartSurface =
            target.closest?.("[aria-label^='Chart #']") || (target.tagName === "CANVAS" ? target : null);
          if (!chartSurface) {
            return;
          }

          const { snapshot } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
          const adapter = resolveAdapterMatch({
            snapshot,
            pageContext: getTradingViewPageMatch(window.location),
          });
          metadata.pageTitle = document.title;
          metadata.pageUrl = window.location.href;
          const symbol = snapshot?.generic?.current_symbol || null;
          const existingPlacement = getSymbolPlanningState(symbol);
          const now = Date.now();

          if (existingPlacement && now - existingPlacement.lastAt < 1_500) {
            clearPlanningSelection();
            return;
          }

          const eventType = existingPlacement
            ? TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_MODIFIED
            : TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_PLACED;
          const nextCount = (existingPlacement?.count || 0) + 1;
          const events = tradeEvidenceDeduper.filter([
            createPlanningPlacementEvent({
              snapshot,
              adapter,
              eventType,
              tool: planningSelection.tool,
              symbol,
              placementCount: nextCount,
            }),
          ]);

          if (symbol) {
            planningPlacements.set(symbol, {
              tool: planningSelection.tool,
              count: nextCount,
              lastAt: now,
            });
          }
          clearPlanningSelection();

          if (events.length) {
            emitInteractionDebug("planning_pointerup", {
              eventType,
              symbol,
              tool: planningSelection.tool,
            });
            onEvents(events, snapshot, adapter);
          }
        },
        true,
      );
      document.addEventListener(
        "change",
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target || !("value" in target)) {
            return;
          }

          const { snapshot } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
          const adapter = resolveAdapterMatch({
            snapshot,
            pageContext: getTradingViewPageMatch(window.location),
          });
          metadata.pageTitle = document.title;
          metadata.pageUrl = window.location.href;
          const events = tradeEvidenceDeduper.filter(detectTradeInputEvents(target, snapshot, metadata, adapter));
          if (events.length) {
            onEvents(events, snapshot, adapter);
          }
        },
        true,
      );
      document.addEventListener(
        "keydown",
        (event) => {
          if (!["Delete", "Backspace"].includes(event.key)) {
            return;
          }

          const { snapshot } = collectDomState({ footerSearchDepth: OBSERVER_CONFIG.footerSearchDepth });
          const symbol = snapshot?.generic?.current_symbol || null;
          const placement = getSymbolPlanningState(symbol);
          if (!placement) {
            return;
          }

          const adapter = resolveAdapterMatch({
            snapshot,
            pageContext: getTradingViewPageMatch(window.location),
          });
          metadata.pageTitle = document.title;
          metadata.pageUrl = window.location.href;
          const events = tradeEvidenceDeduper.filter(
            detectTradeInteractionEvents(
              {
                getAttribute(name) {
                  if (name === "aria-label") {
                    return "Remove objects";
                  }
                  if (name === "data-name") {
                    return "removeAllDrawingTools";
                  }
                  return null;
                },
                closest() {
                  return null;
                },
                textContent: "Remove objects",
              },
              snapshot,
              metadata,
              adapter,
              {
                activePlanningTool: placement.tool,
                hasPlacedPlanningTool: true,
              },
            ),
          );
          planningPlacements.delete(symbol);
          clearPlanningSelection();
          if (events.length) {
            onEvents(events, snapshot, adapter);
          }
        },
        true,
      );
      startHeartbeat();
      refreshGapTimer();
    }

    function stop() {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      window.clearTimeout(debounceTimer);
      for (const timer of followupFlushTimers) {
        window.clearTimeout(timer);
      }
      followupFlushTimers = [];
      window.clearTimeout(gapTimer);
      window.clearInterval(heartbeatTimer);
    }

    function collectNow(reason = "manual_request") {
      flushSnapshot(reason);
    }

    return { start, stop, collectNow };
  }

  global.TiltGuardContent.createTradingViewObserver = createTradingViewObserver;
})(globalThis);
