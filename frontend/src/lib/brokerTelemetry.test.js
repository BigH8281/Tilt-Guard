/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  deriveObservedTradeJournalEntries,
  deriveTradeEvidenceEpisodes,
  hasLiveSessionSymbolMismatch,
  reduceSystemActivityNoise,
  reduceTradeEvidenceNoise,
  scopeTradeEvidenceEvents,
} from "./brokerTelemetry";

describe("deriveTradeEvidenceEpisodes", () => {
  it("groups planning placement and removal into an abandoned episode", () => {
    const episodes = deriveTradeEvidenceEpisodes([
      {
        event_id: "planning-1",
        event_type: "chart_short_tool_selected",
        occurred_at: "2026-03-25T10:00:00Z",
        symbol: "XAUUSD",
        side: "sell",
        confidence: 0.34,
        evidence_stage: "intent_observed",
        details: {
          planning_tool: "short",
        },
      },
      {
        event_id: "planning-2",
        event_type: "chart_position_tool_placed",
        occurred_at: "2026-03-25T10:00:08Z",
        symbol: "XAUUSD",
        side: "sell",
        order_type: "limit",
        confidence: 0.43,
        evidence_stage: "intent_observed",
        details: {
          planning_tool: "short",
        },
      },
      {
        event_id: "planning-3",
        event_type: "chart_position_tool_removed",
        occurred_at: "2026-03-25T10:00:22Z",
        symbol: "XAUUSD",
        side: "sell",
        order_type: "limit",
        confidence: 0.31,
        evidence_stage: "intent_observed",
        details: {
          planning_tool: "short",
        },
      },
    ]);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      episode_type: "abandoned_trade_attempt",
      primary_source_surface: "chart_planning_tool",
      symbol: "XAUUSD",
      side: "sell",
    });
  });

  it("upgrades chart action plus confirmed open into a compact confirmed episode", () => {
    const episodes = deriveTradeEvidenceEpisodes([
      {
        event_id: "chart-buy-1",
        event_type: "chart_trade_buy_clicked",
        occurred_at: "2026-03-25T10:00:00Z",
        symbol: "XAUUSD",
        side: "buy",
        confidence: 0.66,
        evidence_stage: "intent_observed",
      },
      {
        event_id: "chart-buy-2",
        event_type: "chart_trade_execution_unverified",
        occurred_at: "2026-03-25T10:00:01Z",
        symbol: "XAUUSD",
        side: "buy",
        confidence: 0.61,
        evidence_stage: "execution_likely",
      },
      {
        event_id: "position-open-1",
        event_type: "trade_position_opened",
        occurred_at: "2026-03-25T10:00:08Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 2,
        confidence: 0.9,
        evidence_stage: "execution_confirmed",
        details: {
          source_surface: "position_table",
        },
      },
    ]);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      episode_type: "position_open_confirmed",
      primary_source_surface: "chart_inline",
      journal_eligible: true,
      quantity: 2,
    });
  });

  it("splits same-symbol confirmed open and confirmed close into separate journal-eligible episodes", () => {
    const episodes = deriveTradeEvidenceEpisodes([
      {
        event_id: "chart-buy-1",
        event_type: "chart_trade_buy_clicked",
        occurred_at: "2026-03-25T10:00:00Z",
        symbol: "XAUUSD",
        side: "buy",
        confidence: 0.66,
        evidence_stage: "intent_observed",
      },
      {
        event_id: "position-open-1",
        event_type: "trade_position_opened",
        occurred_at: "2026-03-25T10:00:08Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 5,
        confidence: 0.9,
        evidence_stage: "execution_confirmed",
      },
      {
        event_id: "position-close-1",
        event_type: "trade_position_closed",
        occurred_at: "2026-03-25T10:00:20Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 5,
        confidence: 0.91,
        evidence_stage: "execution_confirmed",
      },
    ]);

    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({
      episode_type: "position_close_confirmed",
      journal_eligible: true,
      symbol: "XAUUSD",
      side: "buy",
      quantity: 5,
    });
    expect(episodes[1]).toMatchObject({
      episode_type: "position_open_confirmed",
      journal_eligible: true,
      symbol: "XAUUSD",
      side: "buy",
      quantity: 5,
    });
  });

  it("classifies confirmed position deltas as add and reduce episodes", () => {
    const episodes = deriveTradeEvidenceEpisodes([
      {
        event_id: "position-open-1",
        event_type: "trade_position_opened",
        occurred_at: "2026-03-25T10:00:08Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 1,
        confidence: 0.9,
        evidence_stage: "execution_confirmed",
        details: {
          previous_position_size: 0,
          current_position_size: 1,
          position_delta_quantity: 1,
        },
      },
      {
        event_id: "position-add-1",
        event_type: "trade_position_changed",
        occurred_at: "2026-03-25T10:00:20Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 2,
        confidence: 0.88,
        evidence_stage: "execution_confirmed",
        details: {
          previous_position_size: 1,
          current_position_size: 2,
          previous_position_side: "buy",
          current_position_side: "buy",
          position_delta_quantity: 1,
        },
      },
      {
        event_id: "position-reduce-1",
        event_type: "trade_position_changed",
        occurred_at: "2026-03-25T10:00:35Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 1,
        confidence: 0.87,
        evidence_stage: "execution_confirmed",
        details: {
          previous_position_size: 2,
          current_position_size: 1,
          previous_position_side: "buy",
          current_position_side: "buy",
          position_delta_quantity: -1,
        },
      },
    ]);

    expect(episodes).toHaveLength(3);
    expect(episodes[1]).toMatchObject({
      episode_type: "position_add_confirmed",
      journal_eligible: true,
      delta_quantity: 1,
    });
    expect(episodes[0]).toMatchObject({
      episode_type: "position_reduce_confirmed",
      journal_eligible: true,
      delta_quantity: 1,
    });
  });
});

describe("deriveObservedTradeJournalEntries", () => {
  it("maps confirmed chart-inline outcomes into observed journal trades", () => {
    const episodes = [
      {
        episode_id: "episode-1",
        episode_type: "position_open_confirmed",
        last_event_at: "2026-03-25T10:00:08Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 2,
        confidence: 0.9,
        journal_eligible: true,
        primary_source_surface: "chart_inline",
      },
    ];

    const entries = deriveObservedTradeJournalEntries(episodes, []);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: "observed",
      event_type: "OPEN",
      direction: "buy",
      size: 2,
      note: null,
      source_surface: "chart_inline",
      reflection_pending: true,
    });
  });

  it("keeps planning episodes separate until a confirmed outcome appears", () => {
    const planningOnlyEpisodes = [
      {
        episode_id: "episode-planning-1",
        episode_type: "trade_order_placement_likely",
        last_event_at: "2026-03-25T10:02:00Z",
        symbol: "NAS100",
        side: "buy",
        journal_eligible: false,
        primary_source_surface: "chart_planning_tool",
      },
    ];

    expect(deriveObservedTradeJournalEntries(planningOnlyEpisodes, [])).toEqual([]);
  });

  it("suppresses observed journal trades when a matching manual trade already exists", () => {
    const episodes = [
      {
        episode_id: "episode-close-1",
        episode_type: "position_close_confirmed",
        last_event_at: "2026-03-25T10:05:00Z",
        symbol: "XAUUSD",
        side: "sell",
        quantity: 1,
        confidence: 0.87,
        journal_eligible: true,
        primary_source_surface: "order_ticket",
      },
    ];
    const manualTradeEvents = [
      {
        id: 99,
        event_type: "CLOSE",
        event_time: "2026-03-25T10:05:20Z",
        direction: "sell",
        size: 1,
      },
    ];

    expect(deriveObservedTradeJournalEntries(episodes, manualTradeEvents)).toEqual([]);
  });

  it("keeps planning-only and incomplete episodes out of the journal while keeping confirmed open and close", () => {
    const episodes = [
      {
        episode_id: "episode-open-1",
        episode_type: "position_open_confirmed",
        last_event_at: "2026-03-25T10:05:00Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 5,
        confidence: 0.9,
        journal_eligible: true,
        primary_source_surface: "chart_inline",
      },
      {
        episode_id: "episode-close-1",
        episode_type: "position_close_confirmed",
        last_event_at: "2026-03-25T10:05:20Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 5,
        confidence: 0.91,
        journal_eligible: true,
        primary_source_surface: "observed",
      },
      {
        episode_id: "episode-planning-1",
        episode_type: "planning_intent_observed",
        last_event_at: "2026-03-25T10:05:30Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: null,
        confidence: 0.34,
        journal_eligible: false,
        primary_source_surface: "chart_planning_tool",
      },
    ];

    const entries = deriveObservedTradeJournalEntries(episodes, []);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.event_type)).toEqual(["OPEN", "CLOSE"]);
  });

  it("maps confirmed add and reduce episodes into observed journal trades using the delta size", () => {
    const episodes = [
      {
        episode_id: "episode-add-1",
        episode_type: "position_add_confirmed",
        last_event_at: "2026-03-25T10:05:00Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 2,
        delta_quantity: 1,
        confidence: 0.89,
        journal_eligible: true,
        primary_source_surface: "position_table",
      },
      {
        episode_id: "episode-reduce-1",
        episode_type: "position_reduce_confirmed",
        last_event_at: "2026-03-25T10:05:20Z",
        symbol: "XAUUSD",
        side: "buy",
        quantity: 1,
        delta_quantity: 1,
        confidence: 0.88,
        journal_eligible: true,
        primary_source_surface: "position_table",
      },
    ];

    const entries = deriveObservedTradeJournalEntries(episodes, []);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      event_type: "ADD",
      size: 1,
      direction: "buy",
    });
    expect(entries[1]).toMatchObject({
      event_type: "REDUCE",
      size: 1,
      direction: "buy",
    });
  });

  it("keeps confirmed different-symbol trades journal-eligible and preserves symbol mismatch metadata", () => {
    const episodes = [
      {
        episode_id: "episode-open-2",
        episode_type: "position_open_confirmed",
        last_event_at: "2026-03-25T10:06:00Z",
        symbol: "NAS100",
        side: "buy",
        quantity: 3,
        confidence: 0.93,
        journal_eligible: true,
        primary_source_surface: "chart_inline",
      },
    ];

    const entries = deriveObservedTradeJournalEntries(episodes, [], { sessionSymbol: "XAUUSD" });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event_type: "OPEN",
      symbol: "NAS100",
      session_symbol: "XAUUSD",
      symbol_mismatch: true,
      note: null,
    });
  });
});

describe("reduceTradeEvidenceNoise", () => {
  it("suppresses low-value planning churn and context-only events", () => {
    const events = [
      {
        event_id: "modified-1",
        event_type: "chart_position_tool_modified",
        occurred_at: "2026-03-25T10:00:05Z",
        symbol: "XAUUSD",
        planning_tool: "long",
        side: "buy",
        order_type: "limit",
      },
      {
        event_id: "placed-1",
        event_type: "chart_position_tool_placed",
        occurred_at: "2026-03-25T10:00:04Z",
        symbol: "XAUUSD",
        planning_tool: "long",
        side: "buy",
        order_type: "limit",
      },
      {
        event_id: "ticket-1",
        event_type: "trade_ticket_opened",
        occurred_at: "2026-03-25T10:00:03Z",
        symbol: "XAUUSD",
      },
      {
        event_id: "visible-1",
        event_type: "chart_trade_control_visible",
        occurred_at: "2026-03-25T10:00:02Z",
        symbol: "XAUUSD",
      },
      {
        event_id: "selected-1",
        event_type: "chart_long_tool_selected",
        occurred_at: "2026-03-25T10:00:01Z",
        symbol: "XAUUSD",
        planning_tool: "long",
        side: "buy",
      },
    ];

    const cleaned = reduceTradeEvidenceNoise(events);

    expect(cleaned.map((event) => event.event_type)).toEqual([
      "chart_position_tool_placed",
      "chart_long_tool_selected",
    ]);
  });
});

describe("scopeTradeEvidenceEvents", () => {
  it("keeps session-linked and unlinked same-symbol evidence when symbols match", () => {
    const scoped = scopeTradeEvidenceEvents(
      [
        { event_id: "1", symbol: "XAUUSD", trading_session_id: 4 },
        { event_id: "2", symbol: "XAUUSD", trading_session_id: null },
        { event_id: "3", symbol: "NAS100", trading_session_id: null },
      ],
      { tradingSessionId: 4, sessionSymbol: "XAUUSD", liveSymbol: "XAUUSD" },
    );

    expect(scoped.map((event) => event.event_id)).toEqual(["1", "2"]);
  });

  it("falls back to current live-symbol evidence when the chart drifts away from the journal session symbol", () => {
    const scoped = scopeTradeEvidenceEvents(
      [
        { event_id: "1", symbol: "XAUUSD", trading_session_id: 4 },
        { event_id: "2", symbol: "NAS100", trading_session_id: null },
        { event_id: "3", symbol: "NAS100", trading_session_id: 8 },
      ],
      { tradingSessionId: 4, sessionSymbol: "XAUUSD", liveSymbol: "NAS100" },
    );

    expect(scoped.map((event) => event.event_id)).toEqual(["2", "3"]);
    expect(hasLiveSessionSymbolMismatch("XAUUSD", "NAS100")).toBe(true);
  });
});

describe("reduceSystemActivityNoise", () => {
  it("filters repeated refresh churn and low-value control visibility lines", () => {
    const events = [
      {
        id: 1,
        event_type: "snapshot_refreshed",
        occurred_at: "2026-03-25T10:05:00Z",
        symbol: "XAUUSD",
        message: "TradingView snapshot refreshed for XAUUSD.",
      },
      {
        id: 2,
        event_type: "panel_open_control_visible",
        occurred_at: "2026-03-25T10:04:59Z",
        symbol: "XAUUSD",
        message: "TradingView panel open control detected.",
      },
      {
        id: 3,
        event_type: "broker_connected",
        occurred_at: "2026-03-25T10:04:58Z",
        symbol: "XAUUSD",
        message: "Broker connection observed: Paper Trading",
      },
      {
        id: 4,
        event_type: "broker_connected",
        occurred_at: "2026-03-25T10:04:20Z",
        symbol: "XAUUSD",
        message: "Broker connection observed: Paper Trading",
      },
      {
        id: 5,
        event_type: "monitoring_activated",
        occurred_at: "2026-03-25T10:03:00Z",
        symbol: "XAUUSD",
        message: "Live monitoring activated.",
      },
    ];

    const cleaned = reduceSystemActivityNoise(events);

    expect(cleaned.map((event) => event.event_type)).toEqual(["broker_connected", "monitoring_activated"]);
  });

  it("keeps one honest fallback activity line when only low-signal events remain", () => {
    const events = [
      {
        id: 1,
        event_type: "snapshot_refreshed",
        occurred_at: "2026-03-25T10:05:00Z",
        symbol: "XAUUSD",
        message: "TradingView snapshot refreshed for XAUUSD.",
      },
      {
        id: 2,
        event_type: "panel_open_control_visible",
        occurred_at: "2026-03-25T10:04:59Z",
        symbol: "XAUUSD",
        message: "TradingView panel open control detected.",
      },
    ];

    const cleaned = reduceSystemActivityNoise(events);

    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].event_type).toBe("snapshot_refreshed");
  });
});
