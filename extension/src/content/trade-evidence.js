(function attachTradeEvidence(global) {
  const runtime = global.TiltGuardContent || {};
  const TELEMETRY_EVENT_TYPES = runtime.TELEMETRY_EVENT_TYPES || {
    TRADE_TICKET_OPENED: "trade_ticket_opened",
    TRADE_SIDE_SELECTED: "trade_side_selected",
    TRADE_ORDER_TYPE_DETECTED: "trade_order_type_detected",
    TRADE_QUANTITY_DETECTED: "trade_quantity_detected",
    TRADE_SUBMIT_CLICKED: "trade_submit_clicked",
    TRADE_ORDER_VISIBLE: "trade_order_visible",
    TRADE_POSITION_OPENED: "trade_position_opened",
    TRADE_POSITION_CHANGED: "trade_position_changed",
    TRADE_POSITION_CLOSED: "trade_position_closed",
    TRADE_ORDER_CANCELLED: "trade_order_cancelled",
    TRADE_EXECUTION_UNVERIFIED: "trade_execution_unverified",
    CHART_TRADE_CONTROL_VISIBLE: "chart_trade_control_visible",
    CHART_TRADE_BUY_CLICKED: "chart_trade_buy_clicked",
    CHART_TRADE_SELL_CLICKED: "chart_trade_sell_clicked",
    CHART_LONG_TOOL_SELECTED: "chart_long_tool_selected",
    CHART_SHORT_TOOL_SELECTED: "chart_short_tool_selected",
    CHART_POSITION_TOOL_PLACED: "chart_position_tool_placed",
    CHART_POSITION_TOOL_MODIFIED: "chart_position_tool_modified",
    CHART_POSITION_TOOL_REMOVED: "chart_position_tool_removed",
    CHART_TRADE_EXECUTION_UNVERIFIED: "chart_trade_execution_unverified",
  };
  const TRADE_EVIDENCE_STAGES = runtime.TRADE_EVIDENCE_STAGES || {
    INTENT_OBSERVED: "intent_observed",
    EXECUTION_LIKELY: "execution_likely",
    EXECUTION_CONFIRMED: "execution_confirmed",
  };
  const createEventEnvelope =
    runtime.createEventEnvelope ||
    function createFallbackEventEnvelope({ eventType, snapshot, details = null, pageTitle, pageUrl, brokerAdapter = "tradingview_base", tabId = null }) {
      return {
        event_id: "test-event-id",
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        source: "extension",
        platform: "tradingview",
        broker_adapter: brokerAdapter,
        observation_key: `${brokerAdapter}:${tabId || "unknown"}:${pageUrl || "unknown"}`,
        page_url: pageUrl || "https://www.tradingview.com/chart/test/",
        page_title: pageTitle || "TradingView",
        tab_id: tabId,
        snapshot,
        details,
      };
    };

  const DEDUPE_WINDOWS_MS = {
    default: 2500,
    quantity: 1500,
    position: 4000,
    planning: 5000,
  };

  const ADAPTER_CONFIDENCE_MULTIPLIER = {
    tradingview_base: 0.82,
    tradingview_fxcm: 1,
    tradingview_tradovate: 0.92,
  };

  function toNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function normalizeSide(value) {
    if (!value) {
      return null;
    }

    const lower = String(value).toLowerCase();
    if (lower.includes("buy") || lower.includes("long")) {
      return "buy";
    }
    if (lower.includes("sell") || lower.includes("short")) {
      return "sell";
    }
    return null;
  }

  function normalizePlanningTool(value, side = null) {
    const lower = String(value || "").toLowerCase();
    if (lower.includes("long")) {
      return "long";
    }
    if (lower.includes("short")) {
      return "short";
    }
    if (side === "buy") {
      return "long";
    }
    if (side === "sell") {
      return "short";
    }
    return null;
  }

  function describePlanningToolLabel(value, side = null) {
    return normalizePlanningTool(value, side) || "position";
  }

  function pickStageConfidence(eventType, adapterId) {
    const multiplier = ADAPTER_CONFIDENCE_MULTIPLIER[adapterId] || ADAPTER_CONFIDENCE_MULTIPLIER.tradingview_base;
    const defaults = {
      [TELEMETRY_EVENT_TYPES.TRADE_TICKET_OPENED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.58],
      [TELEMETRY_EVENT_TYPES.TRADE_SIDE_SELECTED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.64],
      [TELEMETRY_EVENT_TYPES.TRADE_ORDER_TYPE_DETECTED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.67],
      [TELEMETRY_EVENT_TYPES.TRADE_QUANTITY_DETECTED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.72],
      [TELEMETRY_EVENT_TYPES.TRADE_SUBMIT_CLICKED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.82],
      [TELEMETRY_EVENT_TYPES.TRADE_ORDER_VISIBLE]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.6],
      [TELEMETRY_EVENT_TYPES.TRADE_POSITION_OPENED]: [TRADE_EVIDENCE_STAGES.EXECUTION_CONFIRMED, 0.88],
      [TELEMETRY_EVENT_TYPES.TRADE_POSITION_CHANGED]: [TRADE_EVIDENCE_STAGES.EXECUTION_CONFIRMED, 0.84],
      [TELEMETRY_EVENT_TYPES.TRADE_POSITION_CLOSED]: [TRADE_EVIDENCE_STAGES.EXECUTION_CONFIRMED, 0.86],
      [TELEMETRY_EVENT_TYPES.TRADE_ORDER_CANCELLED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.76],
      [TELEMETRY_EVENT_TYPES.TRADE_EXECUTION_UNVERIFIED]: [TRADE_EVIDENCE_STAGES.EXECUTION_LIKELY, 0.78],
      [TELEMETRY_EVENT_TYPES.CHART_TRADE_CONTROL_VISIBLE]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.52],
      [TELEMETRY_EVENT_TYPES.CHART_TRADE_BUY_CLICKED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.8],
      [TELEMETRY_EVENT_TYPES.CHART_TRADE_SELL_CLICKED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.8],
      [TELEMETRY_EVENT_TYPES.CHART_LONG_TOOL_SELECTED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.42],
      [TELEMETRY_EVENT_TYPES.CHART_SHORT_TOOL_SELECTED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.42],
      [TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_PLACED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.53],
      [TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_MODIFIED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.4],
      [TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_REMOVED]: [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.38],
      [TELEMETRY_EVENT_TYPES.CHART_TRADE_EXECUTION_UNVERIFIED]: [TRADE_EVIDENCE_STAGES.EXECUTION_LIKELY, 0.74],
    };
    const [stage, baseConfidence] = defaults[eventType] || [TRADE_EVIDENCE_STAGES.INTENT_OBSERVED, 0.55];
    return {
      evidenceStage: stage,
      confidence: Math.min(0.98, Number((baseConfidence * multiplier).toFixed(2))),
    };
  }

  function buildEvidenceDetails({ eventType, snapshot, adapter, rawSignalSummary, overrides = {} }) {
    const trade = snapshot?.trade || {};
    const broker = snapshot?.broker || {};
    const generic = snapshot?.generic || {};
    const { evidenceStage, confidence } = pickStageConfidence(eventType, adapter.id);

    return {
      evidence_stage: evidenceStage,
      confidence,
      symbol: generic.current_symbol || null,
      broker_profile: broker.broker_label || null,
      side: normalizeSide(overrides.side ?? trade.selected_side),
      order_type: overrides.orderType ?? trade.order_type ?? null,
      quantity: toNumber(overrides.quantity ?? trade.quantity),
      price: toNumber(overrides.price ?? trade.price),
      raw_signal_summary: rawSignalSummary,
      source_surface: overrides.sourceSurface ?? null,
      planning_tool: overrides.planningTool ?? null,
      previous_position_size: toNumber(overrides.previousPositionSize),
      current_position_size: toNumber(overrides.currentPositionSize),
      previous_position_side: normalizeSide(overrides.previousPositionSide),
      current_position_side: normalizeSide(overrides.currentPositionSide),
      position_delta_quantity: toNumber(overrides.positionDeltaQuantity),
    };
  }

  function createTradeEvidenceEvent({ eventType, snapshot, metadata, adapter, rawSignalSummary, overrides = {} }) {
    return createEventEnvelope({
      eventType,
      snapshot,
      details: buildEvidenceDetails({
        eventType,
        snapshot,
        adapter,
        rawSignalSummary,
        overrides,
      }),
      brokerAdapter: adapter.id,
      ...metadata,
    });
  }

  function resolvePositionObservation(previousTrade, currentTrade) {
    const explicitPreviousPositionSize = toNumber(previousTrade.position_size);
    const previousNotificationQuantity = toNumber(previousTrade.chart_position_notification_quantity);
    const previousNotificationSide = normalizeSide(previousTrade.chart_position_notification_side);
    const previousPositionSize =
      explicitPreviousPositionSize ??
      ((previousTrade.chart_position_support_active || previousTrade.chart_position_notification_summary) &&
      previousNotificationQuantity
        ? previousNotificationQuantity
        : 0);
    const previousPositionSide =
      normalizeSide(previousTrade.position_side || previousTrade.selected_side) || previousNotificationSide;
    const explicitCurrentPositionSize = toNumber(currentTrade.position_size);
    const explicitCurrentPositionSide = normalizeSide(currentTrade.position_side || currentTrade.selected_side);
    const currentSourceSurface = currentTrade.position_source_surface || null;

    if (explicitCurrentPositionSize !== null || explicitCurrentPositionSide) {
      return {
        previousPositionSize,
        currentPositionSize: explicitCurrentPositionSize ?? previousPositionSize,
        previousPositionSide,
        currentPositionSide: explicitCurrentPositionSide || previousPositionSide,
        sourceSurface: currentSourceSurface || previousTrade.position_source_surface || null,
        derivedFromChartNotification: false,
      };
    }

    const currentNotificationSummary = currentTrade.chart_position_notification_summary || null;
    const previousNotificationSummary = previousTrade.chart_position_notification_summary || null;
    const hasFreshChartNotification = Boolean(
      currentNotificationSummary && currentNotificationSummary !== previousNotificationSummary,
    );
    const notificationQuantity = toNumber(currentTrade.chart_position_notification_quantity);
    const notificationSide = normalizeSide(currentTrade.chart_position_notification_side);

    if (hasFreshChartNotification && notificationQuantity && notificationSide) {
      if (previousPositionSize <= 0) {
        return {
          previousPositionSize,
          currentPositionSize: notificationQuantity,
          previousPositionSide,
          currentPositionSide: notificationSide,
          sourceSurface: "chart_execution_notification",
          derivedFromChartNotification: true,
        };
      }

      if (!previousPositionSide || previousPositionSide === notificationSide) {
        return {
          previousPositionSize,
          currentPositionSize: previousPositionSize + notificationQuantity,
          previousPositionSide,
          currentPositionSide: notificationSide,
          sourceSurface: "chart_execution_notification",
          derivedFromChartNotification: true,
        };
      }

      const remainingQuantity = previousPositionSize - notificationQuantity;
      if (remainingQuantity >= 0) {
        return {
          previousPositionSize,
          currentPositionSize: Math.max(0, remainingQuantity),
          previousPositionSide,
          currentPositionSide: remainingQuantity === 0 ? null : previousPositionSide,
          sourceSurface: "chart_execution_notification",
          derivedFromChartNotification: true,
        };
      }

      return {
        previousPositionSize,
        currentPositionSize: Math.abs(remainingQuantity),
        previousPositionSide,
        currentPositionSide: notificationSide,
        sourceSurface: "chart_execution_notification",
        derivedFromChartNotification: true,
      };
    }

    if (previousPositionSize > 0 && currentTrade.chart_position_support_active) {
      return {
        previousPositionSize,
        currentPositionSize: previousPositionSize,
        previousPositionSide,
        currentPositionSide: previousPositionSide,
        sourceSurface: previousTrade.position_source_surface || "chart_position_support",
        derivedFromChartNotification: false,
      };
    }

    return {
      previousPositionSize,
      currentPositionSize: explicitCurrentPositionSize,
      previousPositionSide,
      currentPositionSide: explicitCurrentPositionSide,
      sourceSurface: currentSourceSurface || previousTrade.position_source_surface || null,
      derivedFromChartNotification: false,
    };
  }

  function buildTradeEvidenceEvents(previous, current, metadata, adapter) {
    const events = [];
    const previousTrade = previous?.trade || {};
    const currentTrade = current?.trade || {};

    if (!previousTrade.ticket_visible && currentTrade.ticket_visible) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_TICKET_OPENED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: "trade ticket became visible",
        }),
      );
    }

    if (!previousTrade.order_visible && currentTrade.order_visible) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_ORDER_VISIBLE,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: "order entry controls are visible",
        }),
      );
    }

    if (!previousTrade.chart_trade_controls_visible && currentTrade.chart_trade_controls_visible) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_TRADE_CONTROL_VISIBLE,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: "chart buy and sell controls are visible",
          overrides: {
            sourceSurface: "chart_inline",
          },
        }),
      );
    }

    if (
      currentTrade.selected_side &&
      previousTrade.selected_side !== currentTrade.selected_side
    ) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_SIDE_SELECTED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `trade side selected: ${currentTrade.selected_side}`,
        }),
      );
    }

    if (currentTrade.order_type && previousTrade.order_type !== currentTrade.order_type) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_ORDER_TYPE_DETECTED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `order type visible: ${currentTrade.order_type}`,
        }),
      );
    }

    if (
      currentTrade.quantity !== null &&
      currentTrade.quantity !== undefined &&
      previousTrade.quantity !== currentTrade.quantity
    ) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_QUANTITY_DETECTED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `order quantity visible: ${currentTrade.quantity}`,
        }),
      );
    }

    const {
      previousPositionSize,
      currentPositionSize,
      previousPositionSide,
      currentPositionSide,
      sourceSurface: positionSourceSurface,
    } = resolvePositionObservation(previousTrade, currentTrade);
    if ((previousPositionSize || 0) <= 0 && (currentPositionSize || 0) > 0) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_POSITION_OPENED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `visible position opened: ${currentPositionSide || "unknown"} ${currentPositionSize}`,
          overrides: {
            quantity: currentPositionSize,
            side: currentPositionSide || currentTrade.selected_side || null,
            sourceSurface: positionSourceSurface || "position_table",
            previousPositionSize: previousPositionSize || 0,
            currentPositionSize,
            previousPositionSide: previousPositionSide || previousTrade.selected_side || null,
            currentPositionSide: currentPositionSide || currentTrade.selected_side || null,
            positionDeltaQuantity: currentPositionSize - (previousPositionSize || 0),
          },
        }),
      );
    } else if ((previousPositionSize || 0) > 0 && (currentPositionSize || 0) <= 0) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_POSITION_CLOSED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: "visible position closed",
          overrides: {
            quantity: previousPositionSize,
            side: previousPositionSide || previousTrade.selected_side || null,
            sourceSurface: positionSourceSurface || previousTrade.position_source_surface || "position_table",
            previousPositionSize,
            currentPositionSize: currentPositionSize || 0,
            previousPositionSide: previousPositionSide || previousTrade.selected_side || null,
            currentPositionSide: currentPositionSide || currentTrade.selected_side || null,
            positionDeltaQuantity: (currentPositionSize || 0) - previousPositionSize,
          },
        }),
      );
    } else if (
      (previousPositionSize || 0) > 0 &&
      (currentPositionSize || 0) > 0 &&
      (previousPositionSize !== currentPositionSize || previousPositionSide !== currentPositionSide)
    ) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_POSITION_CHANGED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `visible position changed to ${currentPositionSide || "unknown"} ${currentPositionSize}`,
          overrides: {
            quantity: currentPositionSize,
            side: currentPositionSide || currentTrade.selected_side || null,
            sourceSurface: positionSourceSurface || "position_table",
            previousPositionSize,
            currentPositionSize,
            previousPositionSide: previousPositionSide || previousTrade.selected_side || null,
            currentPositionSide: currentPositionSide || currentTrade.selected_side || null,
            positionDeltaQuantity: currentPositionSize - previousPositionSize,
          },
        }),
      );
    }

    const previousPlanningVisible = Boolean(previousTrade.chart_planning_object_visible);
    const currentPlanningVisible = Boolean(currentTrade.chart_planning_object_visible);
    const planningSide = currentTrade.chart_planning_tool === "short" ? "sell" : currentTrade.chart_planning_tool === "long" ? "buy" : null;
    const previousPlanningSide =
      previousTrade.chart_planning_tool === "short"
        ? "sell"
        : previousTrade.chart_planning_tool === "long"
          ? "buy"
          : null;

    if (currentTrade.chart_planning_recent_action === "remove" && previousTrade.chart_planning_recent_action !== "remove") {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_REMOVED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `chart ${describePlanningToolLabel(currentTrade.chart_planning_tool, planningSide)} tool removed`,
          overrides: {
            side: planningSide || previousPlanningSide,
            orderType:
              currentTrade.chart_planning_limit_order_visible || previousTrade.chart_planning_limit_order_visible
                ? "limit"
                : null,
            sourceSurface: "chart_planning_tool",
            planningTool: normalizePlanningTool(currentTrade.chart_planning_tool, planningSide || previousPlanningSide),
          },
        }),
      );
    } else if (!previousPlanningVisible && currentPlanningVisible) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_PLACED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `chart ${describePlanningToolLabel(currentTrade.chart_planning_tool, planningSide)} tool placed`,
          overrides: {
            side: planningSide,
            orderType: currentTrade.chart_planning_limit_order_visible ? "limit" : null,
            sourceSurface: "chart_planning_tool",
            planningTool: normalizePlanningTool(currentTrade.chart_planning_tool, planningSide),
          },
        }),
      );
    } else if (
      previousPlanningVisible &&
      currentPlanningVisible &&
      previousTrade.chart_planning_summary &&
      currentTrade.chart_planning_summary &&
      previousTrade.chart_planning_summary !== currentTrade.chart_planning_summary
    ) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_MODIFIED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `chart ${describePlanningToolLabel(currentTrade.chart_planning_tool, planningSide)} tool modified`,
          overrides: {
            side: planningSide || previousPlanningSide,
            orderType: currentTrade.chart_planning_limit_order_visible ? "limit" : null,
            sourceSurface: "chart_planning_tool",
            planningTool: normalizePlanningTool(currentTrade.chart_planning_tool, planningSide || previousPlanningSide),
          },
        }),
      );
    } else if (previousPlanningVisible && !currentPlanningVisible) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_REMOVED,
          snapshot: current,
          metadata,
          adapter,
          rawSignalSummary: `chart ${describePlanningToolLabel(previousTrade.chart_planning_tool, previousPlanningSide)} tool removed`,
          overrides: {
            side: previousPlanningSide,
            orderType: previousTrade.chart_planning_limit_order_visible ? "limit" : null,
            sourceSurface: "chart_planning_tool",
            planningTool: normalizePlanningTool(previousTrade.chart_planning_tool, previousPlanningSide),
          },
        }),
      );
    }

    return events;
  }

  function describeTarget(target) {
    const text = (
      target?.getAttribute?.("aria-label") ||
      target?.getAttribute?.("title") ||
      target?.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    return text.toLowerCase();
  }

  function getTargetDataName(target) {
    return target?.getAttribute?.("data-name") || target?.closest?.("[data-name]")?.getAttribute?.("data-name") || "";
  }

  function getChartTradeSide(target) {
    const dataName = getTargetDataName(target);
    if (dataName === "buy-order-button") {
      return "buy";
    }
    if (dataName === "sell-order-button") {
      return "sell";
    }
    return null;
  }

  function getPlanningTool(target) {
    const dataName = getTargetDataName(target);
    const label = describeTarget(target);
    if (dataName === "FavoriteToolbarLineToolRiskRewardLong" || /long position/.test(label)) {
      return "long";
    }
    if (dataName === "FavoriteToolbarLineToolRiskRewardShort" || /short position/.test(label)) {
      return "short";
    }
    return null;
  }

  function isRemoveObjectsAction(target) {
    const dataName = getTargetDataName(target);
    const label = describeTarget(target);
    return dataName === "removeAllDrawingTools" || /remove objects|remove object|delete drawing/.test(label);
  }

  function detectTradeInteractionEvents(target, snapshot, metadata, adapter, context = {}) {
    const label = describeTarget(target);
    const events = [];
    const chartTradeSide = getChartTradeSide(target);
    const planningTool = getPlanningTool(target);

    if (!label && !chartTradeSide && !planningTool && !isRemoveObjectsAction(target)) {
      return events;
    }

    if (chartTradeSide) {
      events.push(
        createTradeEvidenceEvent({
          eventType:
            chartTradeSide === "buy"
              ? TELEMETRY_EVENT_TYPES.CHART_TRADE_BUY_CLICKED
              : TELEMETRY_EVENT_TYPES.CHART_TRADE_SELL_CLICKED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `chart ${chartTradeSide} control clicked`,
          overrides: {
            side: chartTradeSide,
            sourceSurface: "chart_inline",
          },
        }),
      );
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_TRADE_EXECUTION_UNVERIFIED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `chart ${chartTradeSide} control clicked without visible broker confirmation yet`,
          overrides: {
            side: chartTradeSide,
            sourceSurface: "chart_inline",
          },
        }),
      );
      return events;
    }

    if (planningTool) {
      events.push(
        createTradeEvidenceEvent({
          eventType:
            planningTool === "long"
              ? TELEMETRY_EVENT_TYPES.CHART_LONG_TOOL_SELECTED
              : TELEMETRY_EVENT_TYPES.CHART_SHORT_TOOL_SELECTED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `chart ${planningTool} position tool selected`,
          overrides: {
            side: planningTool === "long" ? "buy" : "sell",
            sourceSurface: "chart_planning_tool",
            planningTool,
          },
        }),
      );
      return events;
    }

    if (isRemoveObjectsAction(target) && context.hasPlacedPlanningTool) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_REMOVED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `chart ${describePlanningToolLabel(context.activePlanningTool)} tool removed`,
          overrides: {
            side:
              context.activePlanningTool === "short"
                ? "sell"
                : context.activePlanningTool === "long"
                  ? "buy"
                  : null,
            sourceSurface: "chart_planning_tool",
            planningTool: context.activePlanningTool || "position",
          },
        }),
      );
      return events;
    }

    if (/place an order|order panel|dom/.test(label)) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_TICKET_OPENED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `trade entry control clicked: ${label}`,
          overrides: {
            sourceSurface: "order_ticket",
          },
        }),
      );
    }

    if (/\bbuy\b|\bsell\b/.test(label)) {
      const side = normalizeSide(label);
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_SIDE_SELECTED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `trade side interaction: ${label}`,
          overrides: { side, sourceSurface: "order_ticket" },
        }),
      );
    }

    if (/\b(place|submit|buy|sell)\b/.test(label)) {
      const side = normalizeSide(label);
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_SUBMIT_CLICKED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `submit control clicked: ${label}`,
          overrides: { side, sourceSurface: "order_ticket" },
        }),
      );
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_EXECUTION_UNVERIFIED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `submit interaction observed without broker-side confirmation: ${label}`,
          overrides: { side, sourceSurface: "order_ticket" },
        }),
      );
    }

    if (/\bcancel\b|\bremove\b/.test(label)) {
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_ORDER_CANCELLED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `cancel interaction observed: ${label}`,
          overrides: {
            sourceSurface: "order_ticket",
          },
        }),
      );
    }

    return events;
  }

  function detectTradeInputEvents(target, snapshot, metadata, adapter) {
    const label = describeTarget(target);
    const events = [];
    const value = target?.value ?? target?.getAttribute?.("value") ?? "";

    if (!label) {
      return events;
    }

    if (/(qty|quantity|contracts|units|amount|size)/.test(label)) {
      const quantity = toNumber(String(value));
      if (quantity !== null) {
        events.push(
          createTradeEvidenceEvent({
            eventType: TELEMETRY_EVENT_TYPES.TRADE_QUANTITY_DETECTED,
            snapshot,
            metadata,
            adapter,
            rawSignalSummary: `quantity input changed to ${quantity}`,
            overrides: { quantity, sourceSurface: "order_ticket" },
          }),
        );
      }
    }

    if (/(order type|market|limit|stop)/.test(label)) {
      const orderType = String(value || label).toLowerCase().replace(/\s+/g, "_");
      events.push(
        createTradeEvidenceEvent({
          eventType: TELEMETRY_EVENT_TYPES.TRADE_ORDER_TYPE_DETECTED,
          snapshot,
          metadata,
          adapter,
          rawSignalSummary: `order type control changed: ${orderType}`,
          overrides: { orderType, sourceSurface: "order_ticket" },
        }),
      );
    }

    return events;
  }

  function createTradeEvidenceDeduper() {
    const recent = new Map();

    function signatureFor(event) {
      const details = event.details || {};
      const includeSummary = !(
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_QUANTITY_DETECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_ORDER_TYPE_DETECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_SIDE_SELECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_SUBMIT_CLICKED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_EXECUTION_UNVERIFIED
      );
      return [
        event.event_type,
        details.symbol || "",
        details.side || "",
        details.order_type || "",
        details.quantity ?? "",
        details.price ?? "",
        includeSummary ? details.raw_signal_summary || "" : "",
      ].join("|");
    }

    function windowFor(event) {
      if (
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_QUANTITY_DETECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_ORDER_TYPE_DETECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_SIDE_SELECTED
      ) {
        return DEDUPE_WINDOWS_MS.quantity;
      }

      if (
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_POSITION_OPENED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_POSITION_CHANGED ||
        event.event_type === TELEMETRY_EVENT_TYPES.TRADE_POSITION_CLOSED
      ) {
        return DEDUPE_WINDOWS_MS.position;
      }

      if (
        event.event_type === TELEMETRY_EVENT_TYPES.CHART_LONG_TOOL_SELECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.CHART_SHORT_TOOL_SELECTED ||
        event.event_type === TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_PLACED ||
        event.event_type === TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_MODIFIED ||
        event.event_type === TELEMETRY_EVENT_TYPES.CHART_POSITION_TOOL_REMOVED
      ) {
        return DEDUPE_WINDOWS_MS.planning;
      }

      return DEDUPE_WINDOWS_MS.default;
    }

    return {
      filter(events, now = Date.now()) {
        return events.filter((event) => {
          const signature = signatureFor(event);
          const hasSeen = recent.has(signature);
          const lastSeenAt = recent.get(signature) || 0;
          if (hasSeen && now - lastSeenAt < windowFor(event)) {
            return false;
          }
          recent.set(signature, now);
          return true;
        });
      },
    };
  }

  global.TiltGuardContent = global.TiltGuardContent || {};
  global.TiltGuardContent.buildTradeEvidenceEvents = buildTradeEvidenceEvents;
  global.TiltGuardContent.createTradeEvidenceEvent = createTradeEvidenceEvent;
  global.TiltGuardContent.detectTradeInteractionEvents = detectTradeInteractionEvents;
  global.TiltGuardContent.detectTradeInputEvents = detectTradeInputEvents;
  global.TiltGuardContent.createTradeEvidenceDeduper = createTradeEvidenceDeduper;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildTradeEvidenceEvents,
      createTradeEvidenceEvent,
      createTradeEvidenceDeduper,
      detectTradeInteractionEvents,
    };
  }
})(globalThis);
