(function attachTiltGuardAdapters(globalScope) {
  const REGISTRY = [
    {
      id: "tradingview_base",
      label: "TradingView Base",
      supportedHostnames: ["www.tradingview.com", "tradingview.com"],
      activationRules: ["TradingView chart route detected"],
      sessionDetectionMethod: "TradingView chart + trading surface DOM observation",
      eventCaptureSources: ["DOM selectors", "page visibility", "navigation heartbeat"],
      confidenceLevel: 0.55,
      reliabilityLevel: "medium",
      supportedEventTypes: [
        "tradingview_tab_detected",
        "trading_panel_visible",
        "order_entry_control_visible",
        "panel_open_control_visible",
        "panel_maximize_control_visible",
        "trade_ticket_opened",
        "trade_side_selected",
        "trade_order_type_detected",
        "trade_quantity_detected",
        "trade_submit_clicked",
        "trade_order_visible",
        "trade_execution_unverified",
        "chart_trade_control_visible",
        "chart_trade_buy_clicked",
        "chart_trade_sell_clicked",
        "chart_long_tool_selected",
        "chart_short_tool_selected",
        "chart_position_tool_placed",
        "chart_position_tool_modified",
        "chart_position_tool_removed",
        "chart_trade_execution_unverified",
      ],
      futureEnforcementCapabilityLevel: "none",
      matches(snapshot, pageContext) {
        return Boolean(snapshot?.generic?.is_tradingview_chart && pageContext?.isTradingViewChart);
      },
      confidence(snapshot) {
        return snapshot?.generic?.trading_panel_visible ? 0.65 : 0.55;
      },
    },
    {
      id: "tradingview_fxcm",
      label: "TradingView FXCM",
      supportedHostnames: ["www.tradingview.com", "tradingview.com"],
      activationRules: ["Broker label includes FXCM", "FXCM footer/account manager pattern matched"],
      sessionDetectionMethod: "TradingView broker label + footer cluster heuristics",
      eventCaptureSources: ["DOM selectors", "broker signature heuristics"],
      confidenceLevel: 0.9,
      reliabilityLevel: "high",
      supportedEventTypes: [
        "broker_connected",
        "broker_label_changed",
        "account_manager_control_visible",
        "order_entry_control_visible",
        "trade_ticket_opened",
        "trade_side_selected",
        "trade_order_type_detected",
        "trade_quantity_detected",
        "trade_submit_clicked",
        "trade_order_visible",
        "trade_position_opened",
        "trade_position_changed",
        "trade_position_closed",
        "trade_order_cancelled",
        "trade_execution_unverified",
        "chart_trade_control_visible",
        "chart_trade_buy_clicked",
        "chart_trade_sell_clicked",
        "chart_long_tool_selected",
        "chart_short_tool_selected",
        "chart_position_tool_placed",
        "chart_position_tool_modified",
        "chart_position_tool_removed",
        "chart_trade_execution_unverified",
      ],
      futureEnforcementCapabilityLevel: "research",
      matches(snapshot) {
        const broker = snapshot?.broker || {};
        const label = broker.broker_label || "";
        return /fxcm/i.test(label) || broker.fxcm_footer_cluster_visible;
      },
      confidence(snapshot) {
        return snapshot?.broker?.broker_connected ? 0.95 : 0.78;
      },
    },
    {
      id: "tradingview_tradovate",
      label: "TradingView Tradovate",
      supportedHostnames: ["www.tradingview.com", "tradingview.com"],
      activationRules: ["Broker label includes Tradovate"],
      sessionDetectionMethod: "TradingView broker label heuristic",
      eventCaptureSources: ["DOM broker label", "Trading panel controls"],
      confidenceLevel: 0.72,
      reliabilityLevel: "experimental",
      supportedEventTypes: [
        "broker_connected",
        "broker_label_changed",
        "order_entry_control_visible",
        "trade_ticket_opened",
        "trade_side_selected",
        "trade_order_type_detected",
        "trade_quantity_detected",
        "trade_submit_clicked",
        "trade_order_visible",
        "trade_position_opened",
        "trade_position_changed",
        "trade_position_closed",
        "trade_order_cancelled",
        "trade_execution_unverified",
        "chart_trade_control_visible",
        "chart_trade_buy_clicked",
        "chart_trade_sell_clicked",
        "chart_long_tool_selected",
        "chart_short_tool_selected",
        "chart_position_tool_placed",
        "chart_position_tool_modified",
        "chart_position_tool_removed",
        "chart_trade_execution_unverified",
      ],
      futureEnforcementCapabilityLevel: "future",
      matches(snapshot) {
        const label = snapshot?.broker?.broker_label || "";
        return /tradovate/i.test(label);
      },
      confidence(snapshot) {
        return snapshot?.broker?.broker_connected ? 0.82 : 0.72;
      },
    },
  ];

  function listBrokerAdapters() {
    return REGISTRY.map((adapter) => ({ ...adapter }));
  }

  function resolveAdapterMatch({ snapshot, pageContext }) {
    const baseAdapter = REGISTRY[0];
    const matched = REGISTRY.filter((adapter) => adapter.matches(snapshot, pageContext));
    const strongest = matched.sort(
      (left, right) => (right.confidence(snapshot, pageContext) || right.confidenceLevel) - (left.confidence(snapshot, pageContext) || left.confidenceLevel),
    )[0] || baseAdapter;

    const confidence = strongest.confidence ? strongest.confidence(snapshot, pageContext) : strongest.confidenceLevel;
    return {
      id: strongest.id,
      label: strongest.label,
      confidence,
      reliabilityLevel: strongest.reliabilityLevel,
      sessionDetectionMethod: strongest.sessionDetectionMethod,
      eventCaptureSources: strongest.eventCaptureSources,
      supportedEventTypes: strongest.supportedEventTypes,
      futureEnforcementCapabilityLevel: strongest.futureEnforcementCapabilityLevel,
      matchedBrokerAdapter: strongest.id !== "tradingview_base",
    };
  }

  globalScope.TiltGuardShared = globalScope.TiltGuardShared || {};
  globalScope.TiltGuardShared.listBrokerAdapters = listBrokerAdapters;
  globalScope.TiltGuardShared.resolveAdapterMatch = resolveAdapterMatch;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      listBrokerAdapters,
      resolveAdapterMatch,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
