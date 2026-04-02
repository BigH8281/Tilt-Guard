/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../../presession_briefing/static/app.js";

function mountShell() {
  document.body.innerHTML = `
    <button id="generateLiveButton"></button>
    <button id="reloadButton"></button>
    <div id="status"></div>
    <div id="summaryCards"></div>
    <div id="scoreCards"></div>
    <div id="narrativePanel"></div>
    <div id="biasTable"></div>
    <div id="guidancePanel"></div>
    <div id="dashboardPanel"></div>
    <div id="playbook"></div>
    <div id="chartTabs"></div>
    <div id="chartStrip"></div>
    <div id="storyStream"></div>
    <pre id="outputBox"></pre>
  `;
}

function buildPayload() {
  return {
    session_bias: "mixed",
    directional_bias: "mixed",
    confidence: "low",
    session_phase: "Opening drive",
    market_regime: "headline-driven",
    narrative: "<script>alert(1)</script> narrative",
    trade_posture: "<b>Wait</b> for confirmation",
    tilt_guard_advice: [
      "<img src=x onerror=alert(2)>",
      "&lt;script&gt;alert(3)&lt;/script&gt;",
    ],
    event_windows: ["Powell <script>alert(4)</script>"],
    red_flags: ["<svg onload=alert(5)>"],
    watchlist_themes: ["<div>markup-like theme</div>"],
    top_drivers: ["<iframe src=javascript:alert(6)>"],
    component_scores: { risk_load: 1.1 },
    bias_table: {
      averages: { gold: 1, nq: -2, mes: 0, bitcoin: 3 },
      rows: [
        {
          category: "<script>alert(7)</script>",
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
        key_drivers: ["<img src=x onerror=alert(8)>"],
        notes: "<script>alert(9)</script>",
      },
    ],
    story_breakdown: [
      {
        category: "macro",
        source: "Feed",
        timestamp: "Live",
        title: "<script>alert(10)</script>",
        summary: "<img src=x onerror=alert(11)>",
        reasoning: "<b>markup-like reasoning</b>",
        link: "javascript:alert(12)",
        channel_impacts: [{ channel: "<script>alert(13)</script>", direction: "up" }],
        bias_scores: { gold: 1, nq: -1, mes: 0, bitcoin: 2 },
      },
    ],
  };
}

describe("pre-session briefing renderer", () => {
  beforeEach(() => {
    mountShell();
  });

  it("renders malicious live and generated text as inert text nodes", () => {
    const app = createApp(document);
    app.renderReport(buildPayload());

    expect(document.querySelector("#storyStream script")).toBeNull();
    expect(document.querySelector("#storyStream img")).toBeNull();
    expect(document.querySelector("#playbook script")).toBeNull();
    expect(document.querySelector("#biasTable script")).toBeNull();
    expect(document.querySelector("#storyStream a")).toBeNull();

    expect(document.getElementById("narrativePanel").textContent).toContain("<script>alert(1)</script>");
    expect(document.getElementById("guidancePanel").textContent).toContain("<img src=x onerror=alert(2)>");
    expect(document.getElementById("guidancePanel").textContent).toContain("&lt;script&gt;alert(3)&lt;/script&gt;");
    expect(document.getElementById("storyStream").textContent).toContain("<script>alert(10)</script>");
    expect(document.getElementById("storyStream").textContent).toContain("<img src=x onerror=alert(11)>");
    expect(document.getElementById("storyStream").textContent).toContain("<b>markup-like reasoning</b>");
  });
});
