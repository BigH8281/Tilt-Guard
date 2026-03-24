/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { DashboardPage } from "./DashboardPage";
import { fetchOpenSession, fetchPosition, fetchSessions, fetchTradeEvents } from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}));

vi.mock("../lib/brokerTelemetry", () => ({
  getTelemetryStatusCopy: () => ({
    label: "Unavailable",
    description: "No recent telemetry",
    tone: "offline",
  }),
  formatTelemetryFreshness: () => "No recent telemetry",
  useLatestBrokerTelemetry: () => ({
    telemetry: null,
    error: "",
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../lib/api", () => ({
  createSession: vi.fn(),
  fetchOpenSession: vi.fn(),
  fetchPosition: vi.fn(),
  fetchSessions: vi.fn(),
  fetchTradeEvents: vi.fn(),
  uploadScreenshot: vi.fn(),
}));

const openSession = {
  id: 12,
  session_name: "London Open",
  symbol: "MNQ",
  status: "open",
  started_at: "2026-03-24T08:00:00Z",
  closed_at: null,
  market_bias: "bullish",
  htf_condition: "trend day",
  expected_open_type: "continuation",
  confidence: 8,
  end_traded_my_time: null,
  end_traded_my_conditions: null,
  end_respected_my_exit: null,
  reason_time_no: null,
  reason_conditions_no: null,
  reason_exit_no: null,
};

function renderDashboardPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage resilience", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchOpenSession.mockResolvedValue(openSession);
    fetchSessions.mockRejectedValue(new Error("Invalid or missing authentication credentials."));
    fetchPosition.mockResolvedValue({ current_open_size: 2 });
    fetchTradeEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("keeps the current session visible when session history fails", async () => {
    renderDashboardPage();

    expect(await screen.findByText("London Open")).toBeTruthy();
    expect(screen.getByText("2 open contracts")).toBeTruthy();
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(
      screen.getByText("Session history: Invalid or missing authentication credentials."),
    ).toBeTruthy();
    expect(screen.getByText("0 rows")).toBeTruthy();
  });
});
