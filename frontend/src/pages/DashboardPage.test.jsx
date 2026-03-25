/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { DashboardPage } from "./DashboardPage";
import {
  createSession,
  fetchOpenSession,
  fetchPosition,
  fetchSessions,
  fetchTradeEvents,
} from "../lib/api";
import { queuePreSessionScreenshot } from "../lib/preSessionScreenshot";

const mockNavigate = vi.fn();

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../lib/brokerTelemetry", () => ({
  getTelemetryStatusCopy: () => ({
    label: "Unavailable",
    description: "No recent telemetry",
    tone: "offline",
  }),
  getUnifiedMonitoringStatusCopy: () => ({
    label: "Live",
    description: "Monitoring is live",
    tone: "live",
  }),
  getLiveSymbol: () => "NAS100",
  getExtensionSessionStatusCopy: () => ({
    label: "Connected",
    description: "Extension connected",
    tone: "live",
  }),
  formatTelemetryFreshness: () => "No recent telemetry",
  useLatestBrokerTelemetry: () => ({
    telemetry: null,
    error: "",
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
  useExtensionSessionStatus: () => ({
    session: {
      status: "live",
      monitoring_state: "active",
      extension_state: "monitoring_active",
      tradingview_detected: true,
      broker_adapter: "tradingview_fxcm",
      broker_profile: "FXCM Live",
      adapter_confidence: 0.95,
      warning_message: "",
      last_heartbeat_at: "2026-03-24T08:05:00Z",
    },
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

vi.mock("../lib/preSessionScreenshot", () => ({
  queuePreSessionScreenshot: vi.fn(),
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
    createSession.mockReset();
    queuePreSessionScreenshot.mockReset();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("keeps the current session visible when session history fails", async () => {
    renderDashboardPage();

    expect(await screen.findByText("London Open")).toBeTruthy();
    expect(screen.getByText("Extension & Live Trading Status")).toBeTruthy();
    expect(screen.getByText("FXCM Live")).toBeTruthy();
    expect(screen.getByText("2 open contracts")).toBeTruthy();
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(
      screen.getByText("Session history: Invalid or missing authentication credentials."),
    ).toBeTruthy();
    expect(screen.getByText("0 rows")).toBeTruthy();
  });

  it("opens the journal immediately and queues the opening screenshot upload", async () => {
    fetchSessions.mockResolvedValue([]);
    fetchOpenSession.mockResolvedValue(null);
    createSession.mockResolvedValue({
      id: 99,
      session_name: "NY Open",
      symbol: "MNQ",
    });

    const user = userEvent.setup();
    renderDashboardPage();

    await screen.findByText("New session");
    await user.click(screen.getByRole("button", { name: "New session" }));
    const file = new File(["image"], "open.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]');
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: "Create session" }));

    await waitFor(() => {
      expect(queuePreSessionScreenshot).toHaveBeenCalledWith(99, file);
      expect(mockNavigate).toHaveBeenCalledWith("/sessions/99");
    });
  });
});
