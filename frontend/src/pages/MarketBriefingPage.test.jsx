/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { MarketBriefingPage } from "./MarketBriefingPage";
import {
  fetchCurrentPreSessionBriefing,
  fetchPreSessionBriefing,
  fetchPreSessionBriefingCapabilities,
} from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}));

vi.mock("../lib/api", () => ({
  fetchCurrentPreSessionBriefing: vi.fn(),
  fetchPreSessionBriefing: vi.fn(),
  fetchPreSessionBriefingCapabilities: vi.fn(),
}));

function buildBriefingResponse(overrides = {}) {
  return {
    generated_at: "2026-04-01T08:00:00+00:00",
    storage: {
      scope: "current-user-briefing",
      saved_at: "2026-04-01T08:00:01+00:00",
    },
    source_health: {
      quotes: { status: "ok", warnings: [] },
      x_alerts: { status: "degraded", warnings: ["x_alerts: nitter timed out"] },
      reddit_social: { status: "ok", warnings: [] },
    },
    warnings: ["charts: vendor unavailable"],
    snapshot: {
      _meta: {
        sources: {
          quotes: "Yahoo Finance via yfinance",
          x_alerts: ["Walter Bloomberg", "Delta One"],
          social: "Reddit r/wallstreetbets hot feed",
        },
      },
      news: [
        {
          headline: "<script>alert(1)</script> fast alert",
          source: "Walter Bloomberg / Delta One",
          impact: "high",
          sentiment: "negative",
          published_at: "2026-04-01T07:45:00+00:00",
          link: "javascript:alert(2)",
        },
      ],
      social: {
        enabled: true,
        sentiment_score: 0.2,
        summary_points: ["<img src=x onerror=alert(3)> retail summary"],
        caution_flags: ["&lt;script&gt;alert(4)&lt;/script&gt;"],
      },
      risk_flags: [
        {
          name: "Powell <script>alert(5)</script>",
          severity: "high",
          kind: "economic_calendar",
          market_relevance: "high",
        },
      ],
    },
    briefing: {
      session_bias: "mixed",
      directional_bias: "mixed",
      confidence: "low",
      session_phase: "Opening drive",
      market_regime: "headline-driven",
      narrative: "<img src=x onerror=alert(6)> narrative",
      trade_posture: "<script>alert(7)</script> wait for confirmation",
      tilt_guard_advice: ["&lt;script&gt;alert(8)&lt;/script&gt;"],
      best_conditions: ["<b>markup-like best condition</b>"],
      avoid_conditions: ["<svg onload=alert(9)>"],
      event_windows: ["Powell <script>alert(10)</script>"],
      top_drivers: ["<iframe src=javascript:alert(11)>"],
      watchlist_themes: ["<div>markup-like theme</div>"],
      red_flags: ["<img src=x onerror=alert(12)>"],
      component_scores: { risk_load: 1.1, composite: 0.3 },
      component_summaries: {
        macro: "Macro is mixed.",
        news: "News is noisy.",
      },
      bias_table: {
        averages: { gold: 1, nq: -2, mes: 0, bitcoin: 3 },
        rows: [
          {
            category: "<script>alert(13)</script>",
            gold: 1,
            nq: -2,
            mes: 0,
            bitcoin: 3,
          },
        ],
      },
      dashboard: [
        {
          index: "NQ",
          avg_bias: -2,
          key_drivers: ["<img src=x onerror=alert(14)>"],
          notes: "<script>alert(15)</script>",
        },
      ],
      story_breakdown: [
        {
          category: "macro",
          source: "Feed",
          timestamp: "Live",
          title: "<script>alert(16)</script>",
          summary: "<img src=x onerror=alert(17)>",
          reasoning: "<b>markup-like reasoning</b>",
          link: "javascript:alert(18)",
          channel_impacts: [{ channel: "<script>alert(19)</script>", direction: "up" }],
          bias_scores: { gold: 1, nq: -1, mes: 0, bitcoin: 2 },
        },
      ],
    },
    ...overrides,
  };
}

function renderMarketBriefingPage() {
  return render(
    <MemoryRouter>
      <MarketBriefingPage />
    </MemoryRouter>,
  );
}

describe("MarketBriefingPage", () => {
  beforeEach(() => {
    fetchPreSessionBriefingCapabilities.mockResolvedValue({
      service: { name: "pre-session-briefing", version: "0.2.0", api_version: "v1" },
      markets: [{ id: "us-index-futures", label: "US index futures" }],
    });
    fetchCurrentPreSessionBriefing.mockReset();
    fetchPreSessionBriefing.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads the latest saved briefing on page revisit and renders content safely", async () => {
    fetchCurrentPreSessionBriefing.mockResolvedValue(buildBriefingResponse());

    renderMarketBriefingPage();

    await screen.findByText("Saved current");
    expect(fetchCurrentPreSessionBriefing).toHaveBeenCalledWith("test-token");
    expect(screen.getByText("<script>alert(7)</script> wait for confirmation")).toBeTruthy();
    expect(screen.getByText("<img src=x onerror=alert(6)> narrative")).toBeTruthy();
    expect(screen.getByText("x_alerts: nitter timed out")).toBeTruthy();
    expect(screen.getByText("Charts are generated on refresh and are not stored with the saved current briefing.")).toBeTruthy();
    const crossAssetHeading = screen.getByRole("heading", { name: "Cross-asset pulse" });
    const socialHeading = screen.getByRole("heading", { name: "Live pulse and caution flags" });
    expect(crossAssetHeading.compareDocumentPosition(socialHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector(".briefing-story-card script")).toBeNull();
    expect(document.querySelector(".briefing-story-card a")).toBeNull();
  });

  it("replaces the saved briefing after a successful regenerate", async () => {
    fetchCurrentPreSessionBriefing.mockResolvedValue(
      buildBriefingResponse({
        briefing: {
          ...buildBriefingResponse().briefing,
          trade_posture: "Saved posture",
          narrative: "Saved narrative",
        },
      }),
    );
    fetchPreSessionBriefing.mockResolvedValue(
      buildBriefingResponse({
        generated_at: "2026-04-01T09:30:00+00:00",
        storage: {
          scope: "current-user-briefing",
          saved_at: "2026-04-01T09:30:01+00:00",
        },
        warnings: [],
        source_health: {
          quotes: { status: "ok", warnings: [] },
        },
        charts: {
          NQ: [
            {
              timeframe: "4H",
              title: "4H structure",
              image_base64: "ZmFrZQ==",
              levels: [{ label: "R1", price: 21950 }],
            },
          ],
        },
        briefing: {
          ...buildBriefingResponse().briefing,
          trade_posture: "Updated posture",
          narrative: "Updated narrative",
        },
      }),
    );

    const user = userEvent.setup();
    renderMarketBriefingPage();

    await screen.findByText("Saved posture");
    await user.click(screen.getByRole("button", { name: "Refresh briefing" }));

    await screen.findByText("Updated posture");
    expect(screen.getByText("Updated narrative")).toBeTruthy();
    expect(screen.getByText("Fresh result")).toBeTruthy();
    expect(screen.getByRole("img", { name: "NQ 4H structure chart" })).toBeTruthy();
    expect(fetchPreSessionBriefing).toHaveBeenCalledWith("test-token", {
      market: "us-index-futures",
      local_timezone: expect.any(String),
      include_snapshot: true,
      include_social: true,
      include_charts: true,
    });
  });

  it("preserves the last good saved briefing when refresh fails", async () => {
    fetchCurrentPreSessionBriefing.mockResolvedValue(
      buildBriefingResponse({
        briefing: {
          ...buildBriefingResponse().briefing,
          trade_posture: "Saved posture",
          narrative: "Saved narrative",
        },
      }),
    );
    fetchPreSessionBriefing.mockRejectedValue(new Error("quotes unavailable"));

    const user = userEvent.setup();
    renderMarketBriefingPage();

    await screen.findByText("Saved posture");
    await user.click(screen.getByRole("button", { name: "Refresh briefing" }));

    await screen.findByText("Refresh failed. Showing the last saved briefing. quotes unavailable");
    expect(screen.getByText("Saved posture")).toBeTruthy();
    expect(screen.getByText("Saved narrative")).toBeTruthy();
    expect(screen.getByText("Refresh failed")).toBeTruthy();
  });

  it("disables chart requests when the backend marks charts unavailable", async () => {
    fetchPreSessionBriefingCapabilities.mockResolvedValue({
      service: { name: "pre-session-briefing", version: "0.2.0", api_version: "v1" },
      markets: [{ id: "us-index-futures", label: "US index futures" }],
      options: { include_snapshot: true, include_social: true, include_charts: false },
    });
    fetchCurrentPreSessionBriefing.mockResolvedValue(
      buildBriefingResponse({
        warnings: [],
      }),
    );
    fetchPreSessionBriefing.mockResolvedValue(
      buildBriefingResponse({
        warnings: [],
        charts: null,
      }),
    );

    const user = userEvent.setup();
    renderMarketBriefingPage();

    await screen.findByText("Saved current");
    expect(screen.getByLabelText("Chart images unavailable in this environment").disabled).toBe(true);
    expect(screen.queryByRole("heading", { name: "Chart pack" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Refresh briefing" }));

    expect(fetchPreSessionBriefing).toHaveBeenCalledWith("test-token", {
      market: "us-index-futures",
      local_timezone: expect.any(String),
      include_snapshot: true,
      include_social: true,
      include_charts: false,
    });
  });
});
