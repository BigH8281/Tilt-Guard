/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { JournalPage } from "./JournalPage";
import {
  closeTrade,
  createJournalEntry,
  endSession,
  fetchJournalEntries,
  fetchPosition,
  fetchScreenshots,
  fetchSessionDetail,
  fetchTradeEvents,
  uploadScreenshot,
} from "../lib/api";
import {
  getPreSessionScreenshotFile,
  getPreSessionScreenshotState,
  markPreSessionScreenshotFailed,
  markPreSessionScreenshotSucceeded,
  markPreSessionScreenshotUploading,
} from "../lib/preSessionScreenshot";

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

vi.mock("../lib/preSessionScreenshot", () => ({
  clearPreSessionScreenshotState: vi.fn(),
  getPreSessionScreenshotFile: vi.fn(),
  getPreSessionScreenshotState: vi.fn(),
  markPreSessionScreenshotFailed: vi.fn(),
  markPreSessionScreenshotSucceeded: vi.fn(),
  markPreSessionScreenshotUploading: vi.fn(),
  queuePreSessionScreenshot: vi.fn(),
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

const closedSession = {
  ...openSession,
  status: "closed",
  closed_at: "2026-03-23T10:00:00Z",
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
    fetchPosition.mockResolvedValue({ current_open_size: 1 });
    closeTrade.mockReset();
    createJournalEntry.mockReset();
    endSession.mockReset();
    uploadScreenshot.mockReset();
    getPreSessionScreenshotState.mockReturnValue(null);
    getPreSessionScreenshotFile.mockReturnValue(null);
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

  it("resyncs authoritative state after screenshot upload fails because the session changed elsewhere", async () => {
    fetchSessionDetail.mockResolvedValueOnce(openSession).mockResolvedValueOnce(closedSession);
    fetchPosition.mockResolvedValueOnce({ current_open_size: 1 }).mockResolvedValueOnce({
      current_open_size: 0,
    });
    fetchTradeEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    fetchScreenshots.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 77,
        screenshot_type: "post",
        file_path: "uploads/77.png",
        file_url: "/uploads/77.png",
        uploaded_at: "2026-03-23T10:00:00Z",
      },
    ]);
    uploadScreenshot.mockRejectedValue(new Error("Session is already closed."));

    renderJournalPage();

    await screen.findByText("Trade Close");
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["image"], "journal.png", { type: "image/png" });

    fireEvent.change(fileInput, {
      target: { files: [file] },
    });

    expect(await screen.findByText("Session is already closed.")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("closed").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Session detail")).toBeTruthy();
    expect(screen.getByText("0 open")).toBeTruthy();
  });

  it("keeps the session shell visible when one related fetch fails during refresh", async () => {
    fetchSessionDetail.mockResolvedValue(openSession);
    fetchPosition.mockResolvedValue({ current_open_size: 1 });
    fetchTradeEvents.mockRejectedValue(new Error("Invalid or missing authentication credentials."));
    fetchJournalEntries.mockResolvedValue([]);
    fetchScreenshots.mockResolvedValue([]);

    renderJournalPage();

    expect(await screen.findByText("NY AM")).toBeTruthy();
    expect(screen.getByText("Some session data could not be refreshed: trade events.")).toBeTruthy();
    expect(screen.getByText("1 open")).toBeTruthy();
  });

  it("uploads a queued pre-session screenshot after the journal opens", async () => {
    const queuedFile = new File(["image"], "pre.png", { type: "image/png" });
    getPreSessionScreenshotState.mockReturnValue({
      sessionId: 1,
      status: "queued",
      fileName: "pre.png",
      error: "",
    });
    getPreSessionScreenshotFile.mockReturnValue(queuedFile);
    uploadScreenshot.mockResolvedValue({
      id: 55,
      screenshot_type: "pre",
      file_path: "screenshots/1/pre.png",
      file_url: "/uploads/screenshots/1/pre.png",
      uploaded_at: "2026-03-23T09:01:00Z",
    });

    renderJournalPage();

    expect(await screen.findByAltText("pre screenshot")).toBeTruthy();
    await waitFor(() => {
      expect(markPreSessionScreenshotUploading).toHaveBeenCalledWith("1");
      expect(markPreSessionScreenshotSucceeded).toHaveBeenCalledWith("1");
      expect(uploadScreenshot).toHaveBeenCalledWith("test-token", "1", "pre", queuedFile);
    });
  });

  it("shows a persistent warning when opening screenshot upload fails", async () => {
    const queuedFile = new File(["image"], "pre.png", { type: "image/png" });
    getPreSessionScreenshotState
      .mockReturnValueOnce({
        sessionId: 1,
        status: "queued",
        fileName: "pre.png",
        error: "",
      })
      .mockReturnValue({
        sessionId: 1,
        status: "failed",
        fileName: "pre.png",
        error: "Invalid or missing authentication credentials.",
      });
    getPreSessionScreenshotFile.mockReturnValue(queuedFile);
    uploadScreenshot.mockRejectedValue(new Error("Invalid or missing authentication credentials."));

    renderJournalPage();

    expect(
      await screen.findByText(/Opening screenshot upload failed\. You can continue journaling and retry now or later\./),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry now" })).toBeTruthy();
  });

  it("resyncs authoritative state after end-session fails because the session closed elsewhere", async () => {
    fetchSessionDetail.mockResolvedValueOnce(openSession).mockResolvedValueOnce(closedSession);
    fetchPosition.mockResolvedValueOnce({ current_open_size: 0 }).mockResolvedValueOnce({
      current_open_size: 0,
    });
    fetchTradeEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    fetchScreenshots.mockResolvedValueOnce([
      {
        id: 88,
        screenshot_type: "post",
        file_path: "uploads/88.png",
        file_url: "/uploads/88.png",
        uploaded_at: "2026-03-23T09:45:00Z",
      },
    ]).mockResolvedValueOnce([
      {
        id: 88,
        screenshot_type: "post",
        file_path: "uploads/88.png",
        file_url: "/uploads/88.png",
        uploaded_at: "2026-03-23T09:45:00Z",
      },
    ]);
    endSession.mockRejectedValue(new Error("Session is already closed."));

    const user = userEvent.setup();
    renderJournalPage();

    const endButton = await screen.findByRole("button", { name: "End Session" });
    await user.click(endButton);
    await user.click(screen.getByRole("button", { name: "Confirm close" }));

    expect(await screen.findByText("Session is already closed.")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("closed").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Session detail")).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
  });
});
