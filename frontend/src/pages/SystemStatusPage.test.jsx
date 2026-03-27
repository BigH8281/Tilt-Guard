/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { SystemStatusPage } from "./SystemStatusPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}));

vi.mock("../lib/brokerTelemetry", () => ({
  deriveTradeEvidenceEpisodes: () => [
    {
      episode_id: "episode-1",
      summary: "Trade execution likely",
      last_event_at: "2026-03-25T10:04:02Z",
      evidence_stage: "execution_likely",
      confidence: 0.8,
      symbol: "XAUUSD",
      side: "buy",
      order_type: "market",
      quantity: 1,
      primary_source_surface: "chart_inline",
    },
  ],
  formatTelemetryFreshness: () => "Updated just now",
  hasLiveSessionSymbolMismatch: () => false,
  getLiveSymbol: () => "XAUUSD",
  reduceSystemActivityNoise: (events) => events,
  reduceTradeEvidenceNoise: (events) => events,
  scopeTradeEvidenceEvents: (events) => events,
  getUnifiedMonitoringStatusCopy: () => ({
    label: "Live",
    description: "Monitoring is live",
    tone: "live",
  }),
  useLatestBrokerTelemetry: () => ({
    telemetry: {
      symbol: "XAUUSD",
      snapshot: {
        broker: { broker_label: "Paper Trading", current_account_name: "Paper 1" },
      },
    },
    error: "",
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
  useExtensionSessionStatus: () => ({
    session: {
      status: "live",
      monitoring_state: "active",
      status_payload: {
        symbol: "XAUUSD",
      },
    },
    error: "",
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
  useBrokerSystemFeed: () => ({
    events: [
      {
        id: 1,
        occurred_at: "2026-03-25T10:05:00Z",
        level: "info",
        message: "TradingView snapshot refreshed for XAUUSD.",
      },
    ],
    error: "",
    isLoading: false,
  }),
  useTradeEvidenceFeed: () => ({
    events: [
      {
        event_id: "evidence-1",
        occurred_at: "2026-03-25T10:04:00Z",
        event_type: "chart_trade_buy_clicked",
        evidence_stage: "intent_observed",
        confidence: 0.8,
        symbol: "XAUUSD",
        side: "buy",
        order_type: "market",
        quantity: 1,
        raw_signal_summary: "chart buy control clicked",
      },
    ],
    error: "",
    isLoading: false,
  }),
}));

vi.mock("../lib/api", () => ({
  fetchTradeEvents: vi.fn(async () => [
    {
      id: 9,
      event_type: "OPEN",
      symbol: "NAS100",
      source: "merged",
      reconciliation_state: "matched",
      event_time: "2026-03-25T10:06:00Z",
    },
  ]),
  fetchSessionDetail: vi.fn(async () => ({
    id: 4,
    session_name: "London Open",
    symbol: "XAUUSD",
    status: "open",
    started_at: "2026-03-25T09:00:00Z",
  })),
}));

function renderSystemStatusPage() {
  return render(
    <MemoryRouter initialEntries={["/sessions/4/system-status"]}>
      <Routes>
        <Route path="/sessions/:sessionId/system-status" element={<SystemStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SystemStatusPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders low-level evidence and activity outside the journal page", async () => {
    renderSystemStatusPage();

    expect(await screen.findByText("System Status")).toBeTruthy();
    expect(screen.getByText("Observed trade episodes")).toBeTruthy();
    expect(screen.getByText("Trade record audit")).toBeTruthy();
    expect(screen.getByText("Raw trade evidence")).toBeTruthy();
    expect(screen.getByText("TradingView activity")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to journal" })).toBeTruthy();
  });
});
