/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { JournalPage } from "./JournalPage";
import {
  closeTrade,
  createJournalEntry,
  fetchJournalEntries,
  fetchPosition,
  fetchScreenshots,
  fetchSessionDetail,
  fetchTradeEvents,
} from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}));

vi.mock("../lib/brokerTelemetry", () => ({
  formatTelemetryFreshness: () => "Updated just now",
  getTelemetryStatusCopy: () => ({
    label: "Offline",
    description: "No recent telemetry",
    tone: "offline",
  }),
  useLatestBrokerTelemetry: () => ({
    telemetry: null,
    error: "",
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../lib/api", () => ({
  closeTrade: vi.fn(),
  createJournalEntry: vi.fn(),
  endSession: vi.fn(),
  fetchJournalEntries: vi.fn(),
  fetchPosition: vi.fn(),
  fetchScreenshots: vi.fn(),
  fetchSessionDetail: vi.fn(),
  fetchTradeEvents: vi.fn(),
  getAssetUrl: vi.fn((path) => path),
  openTrade: vi.fn(),
  updateSessionSetup: vi.fn(),
  uploadScreenshot: vi.fn(),
}));

vi.mock("../lib/screenCapture", () => ({
  captureDisplayFrame: vi.fn(),
}));

const openSession = {
  id: 1,
  session_name: "NY AM",
  symbol: "MNQ",
  status: "open",
  started_at: "2026-03-23T09:00:00Z",
  closed_at: null,
  market_bias: "bullish",
  htf_condition: "trend day",
  expected_open_type: "continuation",
  confidence: 7,
  end_traded_my_time: null,
  end_traded_my_conditions: null,
  end_respected_my_exit: null,
  reason_time_no: null,
  reason_conditions_no: null,
  reason_exit_no: null,
};

function renderJournalPage() {
  return render(
    <MemoryRouter initialEntries={["/sessions/1"]}>
      <Routes>
        <Route path="/sessions/:sessionId" element={<JournalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("JournalPage close-trade recovery", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());

    fetchSessionDetail.mockResolvedValue(openSession);
    fetchJournalEntries.mockResolvedValue([]);
    fetchTradeEvents.mockResolvedValue([]);
    fetchScreenshots.mockResolvedValue([]);
    closeTrade.mockReset();
    createJournalEntry.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("blocks close mode when the refreshed position shows nothing is open", async () => {
    fetchPosition.mockResolvedValueOnce({ current_open_size: 1 }).mockResolvedValueOnce({
      current_open_size: 0,
    });

    const user = userEvent.setup();
    renderJournalPage();

    await screen.findByText("Trade Close");
    await user.click(screen.getByRole("button", { name: "Trade Close" }));

    expect(await screen.findByText("There is no open position available to close.")).toBeTruthy();
    expect(screen.queryByText("PROMPT")).toBeNull();
    expect(closeTrade).not.toHaveBeenCalled();
  });

  it("recovers after a rejected close trade and still submits Enter notes", async () => {
    fetchPosition
      .mockResolvedValueOnce({ current_open_size: 1 })
      .mockResolvedValueOnce({ current_open_size: 1 })
      .mockResolvedValueOnce({ current_open_size: 1 })
      .mockResolvedValueOnce({ current_open_size: 0 });

    closeTrade.mockRejectedValue(new Error("Cannot close a trade because no open position exists."));
    createJournalEntry.mockResolvedValue({
      id: 101,
      content: "Recovered note",
      created_at: "2026-03-23T09:15:00Z",
    });

    const user = userEvent.setup();
    renderJournalPage();

    const closeButton = await screen.findByRole("button", { name: "Trade Close" });
    await user.click(closeButton);

    let input = screen.getByRole("textbox");
    await user.type(input, "1{Enter}");

    input = screen.getByRole("textbox");
    await user.type(input, "25{Enter}");

    input = screen.getByRole("textbox");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Cannot close a trade because no open position exists.")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a note and press Enter")).toBeTruthy();
    });

    input = screen.getByRole("textbox");
    expect(input.disabled).toBe(false);
    await user.type(input, "Recovered note{Enter}");

    await waitFor(() => {
      expect(createJournalEntry).toHaveBeenCalledWith("test-token", "1", "Recovered note");
    });
  });
});
