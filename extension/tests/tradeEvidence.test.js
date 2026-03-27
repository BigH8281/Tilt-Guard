const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTradeEvidenceEvents,
  createTradeEvidenceDeduper,
  detectTradeInteractionEvents,
} = require("../src/content/trade-evidence.js");

function buildMetadata() {
  return {
    pageTitle: "TradingView",
    pageUrl: "https://www.tradingview.com/chart/abc123/",
    tabId: 7,
  };
}

function buildAdapter(id = "tradingview_fxcm") {
  return { id };
}

test("normalizes trade evidence from snapshot diffs", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        ticket_visible: false,
        order_visible: false,
        selected_side: null,
        order_type: null,
        quantity: null,
        position_size: 0,
      },
    },
    {
      generic: { current_symbol: "NAS100" },
      broker: { broker_label: "FXCM Live" },
      trade: {
        ticket_visible: true,
        order_visible: true,
        selected_side: "buy",
        order_type: "market",
        quantity: 2,
        position_size: 0,
      },
    },
    buildMetadata(),
    buildAdapter(),
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    [
      "trade_ticket_opened",
      "trade_order_visible",
      "trade_side_selected",
      "trade_order_type_detected",
      "trade_quantity_detected",
    ],
  );
  assert.equal(events[2].details.side, "buy");
  assert.equal(events[3].details.order_type, "market");
  assert.equal(events[4].details.quantity, 2);
});

test("assigns execution_confirmed stage to visible position changes", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        position_size: 0,
      },
    },
    {
      generic: { current_symbol: "MNQ" },
      broker: { broker_label: "Tradovate" },
      trade: {
        position_size: 1,
        position_side: "buy",
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_tradovate"),
  );

  assert.equal(events[0].event_type, "trade_position_opened");
  assert.equal(events[0].details.evidence_stage, "execution_confirmed");
  assert.ok(events[0].details.confidence >= 0.8);
});

test("includes previous and current visible position sizes on confirmed position changes", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        position_size: 1,
        position_side: "buy",
      },
    },
    {
      generic: { current_symbol: "MNQ" },
      broker: { broker_label: "Tradovate" },
      trade: {
        position_size: 2,
        position_side: "buy",
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_tradovate"),
  );

  assert.equal(events[0].event_type, "trade_position_changed");
  assert.equal(events[0].details.previous_position_size, 1);
  assert.equal(events[0].details.current_position_size, 2);
  assert.equal(events[0].details.position_delta_quantity, 1);
  assert.equal(events[0].details.current_position_side, "buy");
});

test("derives confirmed open from chart execution notifications without a visible positions table", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        position_size: 0,
        position_side: null,
        chart_position_notification_summary: null,
      },
    },
    {
      generic: { current_symbol: "EURUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        position_size: null,
        position_side: null,
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Buy 1,005 at 1.15337",
        chart_position_notification_side: "buy",
        chart_position_notification_quantity: 1005,
        chart_position_support_active: true,
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "trade_position_opened");
  assert.equal(events[0].details.source_surface, "chart_execution_notification");
  assert.equal(events[0].details.current_position_size, 1005);
  assert.equal(events[0].details.current_position_side, "buy");
});

test("derives position add transitions from fresh chart execution notifications without a positions table", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        position_size: 1005,
        position_side: "buy",
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Buy 1,005 at 1.15337",
      },
    },
    {
      generic: { current_symbol: "EURUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        position_size: null,
        position_side: null,
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Buy 1,005 at 1.15365",
        chart_position_notification_side: "buy",
        chart_position_notification_quantity: 1005,
        chart_position_support_active: true,
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "trade_position_changed");
  assert.equal(events[0].details.source_surface, "chart_execution_notification");
  assert.equal(events[0].details.previous_position_size, 1005);
  assert.equal(events[0].details.current_position_size, 2010);
  assert.equal(events[0].details.position_delta_quantity, 1005);
});

test("derives position close transitions from fresh chart execution notifications without a positions table", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        position_size: 1005,
        position_side: "buy",
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Buy 1,005 at 1.15365",
      },
    },
    {
      generic: { current_symbol: "EURUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        position_size: null,
        position_side: null,
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Sell 1,005 at 1.15320",
        chart_position_notification_side: "sell",
        chart_position_notification_quantity: 1005,
        chart_position_support_active: false,
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "trade_position_closed");
  assert.equal(events[0].details.source_surface, "chart_execution_notification");
  assert.equal(events[0].details.previous_position_size, 1005);
  assert.equal(events[0].details.current_position_size, 0);
  assert.equal(events[0].details.position_delta_quantity, -1005);
});

test("derives close transitions from chart notifications even when the previous snapshot only had chart-supported state", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        position_size: null,
        position_side: null,
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Buy 1,005 at 1.15365",
        chart_position_notification_side: "buy",
        chart_position_notification_quantity: 1005,
        chart_position_support_active: true,
      },
    },
    {
      generic: { current_symbol: "EURUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        position_size: null,
        position_side: null,
        chart_position_notification_summary: "Market order executed on OANDA:EURUSD Close Sell 1,005 at 1.15320",
        chart_position_notification_side: "sell",
        chart_position_notification_quantity: 1005,
        chart_position_support_active: true,
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "trade_position_closed");
  assert.equal(events[0].details.source_surface, "chart_execution_notification");
  assert.equal(events[0].details.previous_position_size, 1005);
  assert.equal(events[0].details.current_position_size, 0);
});

test("dedupes repeated evidence within a short window", () => {
  const deduper = createTradeEvidenceDeduper();
  const first = {
    event_type: "trade_submit_clicked",
    details: {
      symbol: "NAS100",
      side: "buy",
      order_type: "market",
      quantity: 1,
      price: null,
      raw_signal_summary: "submit control clicked: buy",
    },
  };
  const second = JSON.parse(JSON.stringify(first));

  const initial = deduper.filter([first], 1_000);
  const repeated = deduper.filter([second], 2_000);

  assert.equal(initial.length, 1);
  assert.equal(repeated.length, 0);
});

test("emits chart control visibility when inline trading controls appear", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        chart_trade_controls_visible: false,
      },
    },
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        chart_trade_controls_visible: true,
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "chart_trade_control_visible");
  assert.equal(events[0].details.source_surface, "chart_inline");
  assert.equal(events[0].details.evidence_stage, "intent_observed");
});

test("classifies chart buy clicks as inline action evidence", () => {
  const target = {
    getAttribute(name) {
      if (name === "data-name") {
        return "buy-order-button";
      }
      return null;
    },
    closest() {
      return null;
    },
    textContent: "BUY",
  };
  const events = detectTradeInteractionEvents(
    target,
    {
      generic: { current_symbol: "NAS100" },
      broker: { broker_label: "Paper Trading" },
      trade: {},
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    ["chart_trade_buy_clicked", "chart_trade_execution_unverified"],
  );
  assert.equal(events[0].details.source_surface, "chart_inline");
  assert.equal(events[0].details.side, "buy");
});

test("classifies chart sell clicks as inline action evidence", () => {
  const target = {
    getAttribute(name) {
      if (name === "data-name") {
        return "sell-order-button";
      }
      return null;
    },
    closest() {
      return null;
    },
    textContent: "SELL",
  };
  const events = detectTradeInteractionEvents(
    target,
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {},
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    ["chart_trade_sell_clicked", "chart_trade_execution_unverified"],
  );
  assert.equal(events[0].details.source_surface, "chart_inline");
  assert.equal(events[0].details.side, "sell");
});

test("classifies long-position tool selection as planning intent", () => {
  const target = {
    getAttribute(name) {
      if (name === "data-name") {
        return "FavoriteToolbarLineToolRiskRewardLong";
      }
      return null;
    },
    closest() {
      return null;
    },
    textContent: "Long position",
  };
  const events = detectTradeInteractionEvents(
    target,
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {},
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "chart_long_tool_selected");
  assert.equal(events[0].details.planning_tool, "long");
  assert.equal(events[0].details.source_surface, "chart_planning_tool");
  assert.equal(events[0].details.evidence_stage, "intent_observed");
});

test("classifies short-position tool selection as planning intent", () => {
  const target = {
    getAttribute(name) {
      if (name === "data-name") {
        return "FavoriteToolbarLineToolRiskRewardShort";
      }
      return null;
    },
    closest() {
      return null;
    },
    textContent: "Short position",
  };
  const events = detectTradeInteractionEvents(
    target,
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {},
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "chart_short_tool_selected");
  assert.equal(events[0].details.planning_tool, "short");
  assert.equal(events[0].details.source_surface, "chart_planning_tool");
  assert.equal(events[0].details.side, "sell");
});

test("derives planning-tool placement from visible chart object state", () => {
  const events = buildTradeEvidenceEvents(
    {
      trade: {
        chart_planning_object_visible: false,
        chart_planning_tool: null,
        chart_planning_summary: null,
      },
    },
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        chart_planning_object_visible: true,
        chart_planning_tool: "long",
        chart_planning_limit_order_visible: true,
        chart_planning_summary: "long|limit|settings|remove|more",
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "chart_position_tool_placed");
  assert.equal(events[0].details.planning_tool, "long");
  assert.equal(events[0].details.order_type, "limit");
  assert.equal(events[0].details.side, "buy");
});

test("derives planning-tool removal from visible chart object state", () => {
  const events = buildTradeEvidenceEvents(
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        chart_planning_object_visible: true,
        chart_planning_tool: "short",
        chart_planning_limit_order_visible: true,
        chart_planning_recent_action: "create",
        chart_planning_summary: "short|limit|settings|remove|more",
      },
    },
    {
      generic: { current_symbol: "XAUUSD" },
      broker: { broker_label: "Paper Trading" },
      trade: {
        chart_planning_object_visible: true,
        chart_planning_tool: "short",
        chart_planning_limit_order_visible: false,
        chart_planning_recent_action: "remove",
        chart_planning_summary: "short|remove|settings|remove|more",
      },
    },
    buildMetadata(),
    buildAdapter("tradingview_base"),
  );

  assert.equal(events[0].event_type, "chart_position_tool_removed");
  assert.equal(events[0].details.planning_tool, "short");
  assert.equal(events[0].details.order_type, "limit");
  assert.equal(events[0].details.side, "sell");
});

test("dedupes repeated planning-tool modifications within the planning window", () => {
  const deduper = createTradeEvidenceDeduper();
  const event = {
    event_type: "chart_position_tool_modified",
    details: {
      symbol: "XAUUSD",
      side: "buy",
      order_type: null,
      quantity: "",
      price: "",
      planning_tool: "long",
      raw_signal_summary: "chart long position tool modified on XAUUSD",
    },
  };

  const first = deduper.filter([event], 1_000);
  const repeated = deduper.filter([JSON.parse(JSON.stringify(event))], 4_000);
  const later = deduper.filter([JSON.parse(JSON.stringify(event))], 7_000);

  assert.equal(first.length, 1);
  assert.equal(repeated.length, 0);
  assert.equal(later.length, 1);
});
