const liveSteps = [
  "Pulling futures quotes...",
  "Scanning fast-alert feeds for things traders will overreact to...",
  "Checking the financial calendar so Powell does not jump-scare us...",
  "Reading macro headlines and blaming at least some of it on yields...",
  "Comparing gold, NQ, MES, and Bitcoin like a slightly sleep-deprived macro desk...",
  "Scoring cross-asset drivers before someone says it is all priced in...",
  "Ranking stories by whether they actually matter or just sound dramatic on X...",
  "Marking obvious levels before they get renamed liquidity pools...",
  "Drawing charts and pretending candles are civilized...",
  "Building the playbook and avoiding fake guru energy...",
  "Finishing the brief before the market changes its mind again...",
];

function clearNode(node) {
  node.replaceChildren();
}

function appendTextElement(documentRef, parent, tagName, text, className = "") {
  const node = documentRef.createElement(tagName);
  if (className) {
    node.className = className;
  }
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function appendList(documentRef, parent, items, emptyText = "None.") {
  if (!items.length) {
    appendTextElement(documentRef, parent, "p", emptyText);
    return;
  }

  const list = documentRef.createElement("ul");
  items.forEach((item) => {
    appendTextElement(documentRef, list, "li", String(item));
  });
  parent.appendChild(list);
}

function safeExternalUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(String(value), "http://localhost");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveNodes(root) {
  return {
    outputBox: root.getElementById("outputBox"),
    generateLiveButton: root.getElementById("generateLiveButton"),
    reloadButton: root.getElementById("reloadButton"),
    statusNode: root.getElementById("status"),
    summaryCards: root.getElementById("summaryCards"),
    scoreCards: root.getElementById("scoreCards"),
    narrativePanel: root.getElementById("narrativePanel"),
    biasTableNode: root.getElementById("biasTable"),
    guidancePanel: root.getElementById("guidancePanel"),
    dashboardPanel: root.getElementById("dashboardPanel"),
    playbookNode: root.getElementById("playbook"),
    chartTabsNode: root.getElementById("chartTabs"),
    chartStripNode: root.getElementById("chartStrip"),
    storyStreamNode: root.getElementById("storyStream"),
  };
}

export function createApp(root = document) {
  const documentRef = root;
  const nodes = resolveNodes(root);
  if (!nodes.outputBox) {
    return null;
  }

  let statusTimer = null;
  let activeChartSymbol = "NQ";

  function setStatus(message, isError = false) {
    nodes.statusNode.textContent = message;
    nodes.statusNode.classList.toggle("error", isError);
  }

  function stopStatusCycle() {
    if (statusTimer) {
      window.clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  function startStatusCycle() {
    stopStatusCycle();
    let index = 0;
    setStatus(liveSteps[index]);
    statusTimer = window.setInterval(() => {
      index = (index + 1) % liveSteps.length;
      setStatus(liveSteps[index]);
    }, 1250);
  }

  function renderCardRow(node, items, className) {
    clearNode(node);
    items.forEach(([label, value]) => {
      const card = documentRef.createElement("article");
      card.className = className;
      appendTextElement(documentRef, card, "span", String(label));
      appendTextElement(documentRef, card, "strong", String(value));
      node.appendChild(card);
    });
  }

  function renderSummaryCards(payload) {
    renderCardRow(nodes.summaryCards, [
      ["Directional Bias", payload.directional_bias || payload.session_bias],
      ["Confidence", payload.confidence],
      ["Session Phase", payload.session_phase],
      ["Regime", payload.market_regime],
      ["Risk Load", String(payload.component_scores.risk_load)],
    ], "card");

    renderCardRow(nodes.scoreCards, [
      ["Gold Avg", `${payload.bias_table.averages.gold}/10`],
      ["NQ Avg", `${payload.bias_table.averages.nq}/10`],
      ["MES Avg", `${payload.bias_table.averages.mes}/10`],
      ["Bitcoin Avg", `${payload.bias_table.averages.bitcoin}/10`],
    ], "card compact");
  }

  function renderNarrative(payload) {
    clearNode(nodes.narrativePanel);
    appendTextElement(documentRef, nodes.narrativePanel, "div", "Narrative", "section-label");
    appendTextElement(documentRef, nodes.narrativePanel, "p", payload.narrative || "");
  }

  function renderBiasTable(payload) {
    clearNode(nodes.biasTableNode);

    const table = documentRef.createElement("table");
    table.className = "bias-table";

    const thead = documentRef.createElement("thead");
    const headerRow = documentRef.createElement("tr");
    ["Category", "Gold", "NQ", "MES", "Bitcoin"].forEach((label) => {
      appendTextElement(documentRef, headerRow, "th", label);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = documentRef.createElement("tbody");
    (payload.bias_table.rows || []).forEach((row) => {
      const tr = documentRef.createElement("tr");
      [row.category, row.gold, row.nq, row.mes, row.bitcoin].forEach((value) => {
        appendTextElement(documentRef, tr, "td", String(value));
      });
      tbody.appendChild(tr);
    });

    const averageRow = documentRef.createElement("tr");
    averageRow.className = "avg-row";
    [
      "Average Bias",
      `${payload.bias_table.averages.gold}/10`,
      `${payload.bias_table.averages.nq}/10`,
      `${payload.bias_table.averages.mes}/10`,
      `${payload.bias_table.averages.bitcoin}/10`,
    ].forEach((value) => {
      appendTextElement(documentRef, averageRow, "td", value);
    });
    tbody.appendChild(averageRow);

    table.appendChild(tbody);
    nodes.biasTableNode.appendChild(table);
  }

  function renderDashboard(payload) {
    clearNode(nodes.dashboardPanel);
    (payload.dashboard || []).forEach((item) => {
      const card = documentRef.createElement("article");
      card.className = "dashboard-card";

      const header = documentRef.createElement("header");
      appendTextElement(documentRef, header, "span", item.index);
      appendTextElement(documentRef, header, "strong", `${item.avg_bias}/10`);
      card.appendChild(header);

      appendList(documentRef, card, item.key_drivers || []);
      appendTextElement(documentRef, card, "p", item.notes || "");
      nodes.dashboardPanel.appendChild(card);
    });
  }

  function renderGuidance(payload) {
    clearNode(nodes.guidancePanel);
    const grid = documentRef.createElement("div");
    grid.className = "guidance-grid";

    const sections = [
      ["Briefing", payload.trade_posture || "", null],
      ["Event Windows", null, payload.event_windows || []],
      ["Tilt-Guard Advice", null, payload.tilt_guard_advice || []],
    ];

    sections.forEach(([title, text, items]) => {
      const section = documentRef.createElement("section");
      section.className = "guidance-card";
      appendTextElement(documentRef, section, "h3", title);
      if (text !== null) {
        appendTextElement(documentRef, section, "p", text);
      } else {
        appendList(
          documentRef,
          section,
          items,
          title === "Event Windows" ? "No immediate scheduled event window." : "No advice available.",
        );
      }
      grid.appendChild(section);
    });

    nodes.guidancePanel.appendChild(grid);
  }

  function renderPlaybook(payload) {
    clearNode(nodes.playbookNode);
    [
      ["Red Flags", payload.red_flags || []],
      ["Watchlist Themes", payload.watchlist_themes || []],
      ["Top Drivers", payload.top_drivers || []],
    ].forEach(([title, items]) => {
      const card = documentRef.createElement("section");
      card.className = "playbook-card";
      appendTextElement(documentRef, card, "h3", title);
      appendList(documentRef, card, items);
      nodes.playbookNode.appendChild(card);
    });
  }

  function appendImpactChips(parent, impacts) {
    (impacts || []).forEach((item) => {
      const arrow = item.direction === "up" ? "↑" : item.direction === "down" ? "↓" : "→";
      const chip = documentRef.createElement("span");
      chip.className = `impact-chip ${
        item.direction === "up"
          ? "impact-up"
          : item.direction === "down"
            ? "impact-down"
            : "impact-flat"
      }`;
      chip.textContent = `${item.channel} ${arrow}`;
      parent.appendChild(chip);
    });
  }

  function renderStories(payload) {
    clearNode(nodes.storyStreamNode);
    (payload.story_breakdown || []).forEach((story) => {
      const card = documentRef.createElement("article");
      card.className = "story-card";

      const meta = documentRef.createElement("div");
      meta.className = "story-meta";
      [
        String(story.category || "").replaceAll("_", " "),
        story.source || "Live feed",
        story.timestamp || "Live",
      ].forEach((value) => appendTextElement(documentRef, meta, "span", value));
      card.appendChild(meta);

      const title = documentRef.createElement("h3");
      const storyUrl = safeExternalUrl(story.link);
      if (storyUrl) {
        const anchor = documentRef.createElement("a");
        anchor.href = storyUrl;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = story.title || "";
        title.appendChild(anchor);
      } else {
        title.textContent = story.title || "";
      }
      card.appendChild(title);

      appendTextElement(documentRef, card, "p", story.summary || "");

      const subgrid = documentRef.createElement("div");
      subgrid.className = "story-subgrid";

      const channelsSection = documentRef.createElement("section");
      appendTextElement(documentRef, channelsSection, "h4", "Impact Channels");
      const impactRow = documentRef.createElement("div");
      impactRow.className = "impact-row";
      appendImpactChips(impactRow, story.channel_impacts || []);
      channelsSection.appendChild(impactRow);
      subgrid.appendChild(channelsSection);

      const biasSection = documentRef.createElement("section");
      appendTextElement(documentRef, biasSection, "h4", "Bias Scores");
      const biasList = documentRef.createElement("ul");
      [
        ["Gold", story.bias_scores?.gold],
        ["NQ", story.bias_scores?.nq],
        ["MES", story.bias_scores?.mes],
        ["Bitcoin", story.bias_scores?.bitcoin],
      ].forEach(([label, value]) => {
        appendTextElement(documentRef, biasList, "li", `${label}: ${value ?? ""}`);
      });
      biasSection.appendChild(biasList);
      subgrid.appendChild(biasSection);

      card.appendChild(subgrid);
      appendTextElement(documentRef, card, "p", story.reasoning || "", "story-reasoning");
      nodes.storyStreamNode.appendChild(card);
    });
  }

  function renderCharts(charts) {
    clearNode(nodes.chartTabsNode);
    clearNode(nodes.chartStripNode);

    if (!charts || !Object.keys(charts).length) {
      return;
    }

    const symbols = Object.keys(charts);
    if (!symbols.includes(activeChartSymbol)) {
      activeChartSymbol = symbols[0];
    }

    symbols.forEach((symbol) => {
      const button = documentRef.createElement("button");
      button.className = `tab-button ${symbol === activeChartSymbol ? "active" : ""}`;
      button.dataset.symbol = symbol;
      button.type = "button";
      button.textContent = symbol;
      button.addEventListener("click", () => {
        activeChartSymbol = symbol;
        renderCharts(charts);
      });
      nodes.chartTabsNode.appendChild(button);
    });

    (charts[activeChartSymbol] || []).forEach((chart) => {
      const card = documentRef.createElement("article");
      card.className = "chart-card";

      const header = documentRef.createElement("header");
      appendTextElement(documentRef, header, "span", activeChartSymbol);
      appendTextElement(documentRef, header, "strong", chart.title || "");
      card.appendChild(header);

      const image = documentRef.createElement("img");
      image.src = `data:image/png;base64,${chart.image_base64}`;
      image.alt = `${activeChartSymbol} ${chart.title} chart`;
      card.appendChild(image);

      const levels = documentRef.createElement("div");
      levels.className = "chart-levels";
      (chart.levels || []).forEach((level) => {
        appendTextElement(documentRef, levels, "span", `${level.label}: ${level.price}`);
      });
      card.appendChild(levels);

      nodes.chartStripNode.appendChild(card);
    });
  }

  function renderReport(payload, rawPayload = payload, charts = null) {
    renderSummaryCards(payload);
    renderNarrative(payload);
    renderBiasTable(payload);
    renderGuidance(payload);
    renderDashboard(payload);
    renderPlaybook(payload);
    renderCharts(charts);
    renderStories(payload);
    nodes.outputBox.textContent = JSON.stringify(rawPayload, null, 2);
  }

  async function loadSample() {
    startStatusCycle();
    try {
      const response = await fetch("/api/sample");
      const snapshot = await response.json();
      const resultResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const result = await resultResponse.json();
      if (!resultResponse.ok) {
        throw new Error(result.error || "Sample generation failed.");
      }
      renderReport(result, result, null);
      setStatus("Sample briefing loaded.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      stopStatusCycle();
    }
  }

  async function generateLiveBriefing() {
    startStatusCycle();
    try {
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch("/api/generate-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: "us-index-futures",
          local_timezone: localTimezone,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Live generation failed.");
      }
      renderReport(result.briefing, result, result.charts || null);
      setStatus("Live briefing generated.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      stopStatusCycle();
    }
  }

  nodes.reloadButton?.addEventListener("click", loadSample);
  nodes.generateLiveButton?.addEventListener("click", generateLiveBriefing);

  return {
    generateLiveBriefing,
    loadSample,
    renderReport,
    setStatus,
    startStatusCycle,
    stopStatusCycle,
  };
}

const app = createApp(document);

export { app, liveSteps, safeExternalUrl };
