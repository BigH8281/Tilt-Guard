(function attachDomState(global) {
  const { FXCM_SIGNATURE, TRADINGVIEW_SELECTORS, getTradingViewPageMatch } = global.TiltGuardContent;
  const { countDistinctSignals, resolveBrokerSignature } = global.TiltGuardShared;

  function findTextMatches(targetText, scope = document.body) {
    const matches = [];
    if (!scope) {
      return matches;
    }

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const value = textNode.textContent?.trim();
      if (value === targetText) {
        matches.push(textNode.parentElement || null);
      }
    }
    return matches.filter(Boolean);
  }

  function hasExactText(node, targetText) {
    if (!node) {
      return false;
    }

    return findTextMatches(targetText, node).length > 0;
  }

  function expandAncestors(nodes, maxDepth) {
    const ancestors = [];
    for (const node of nodes.filter(Boolean)) {
      let current = node;
      let depth = 0;
      while (current && depth <= maxDepth) {
        ancestors.push(current);
        current = current.parentElement;
        depth += 1;
      }
    }
    return ancestors;
  }

  function dedupeElements(nodes) {
    return [...new Set(nodes.filter(Boolean))];
  }

  function findFooterCluster(signalNodes, maxDepth) {
    const candidateContainers = dedupeElements(expandAncestors(signalNodes, maxDepth));
    for (const container of candidateContainers) {
      const containsBrokerLabel = hasExactText(container, FXCM_SIGNATURE.brokerLabel);
      const hasAccountManager =
        !!container.querySelector(TRADINGVIEW_SELECTORS.accountManagerButton) ||
        !!container.querySelector(TRADINGVIEW_SELECTORS.accountManagerRegion);
      const hasOrderEntry = !!container.querySelector(TRADINGVIEW_SELECTORS.orderEntryButton);
      const hasPanelControl =
        !!container.querySelector(TRADINGVIEW_SELECTORS.panelOpenButton) ||
        !!container.querySelector(TRADINGVIEW_SELECTORS.panelMaximizeButton);

      if (countDistinctSignals([containsBrokerLabel, hasAccountManager, hasOrderEntry || hasPanelControl]) >= 3) {
        return container;
      }
    }

    return null;
  }

  function getBrokerLabel() {
    const brokerSelectorButton = document.querySelector(TRADINGVIEW_SELECTORS.brokerSelectorButton);
    const accountManagerButton = document.querySelector(TRADINGVIEW_SELECTORS.accountManagerButton);
    const candidates = [brokerSelectorButton?.textContent, accountManagerButton?.textContent];

    for (const candidate of candidates) {
      const brokerLabel = sanitizeBrokerLabel(candidate);
      if (brokerLabel) {
        return brokerLabel;
      }
    }

    return findTextMatches(FXCM_SIGNATURE.brokerLabel).length ? FXCM_SIGNATURE.brokerLabel : null;
  }

  function collapseRepeatedText(value) {
    const trimmed = value?.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      return null;
    }

    const midpoint = Math.floor(trimmed.length / 2);
    if (trimmed.length % 2 === 0 && trimmed.slice(0, midpoint) === trimmed.slice(midpoint)) {
      return trimmed.slice(0, midpoint);
    }

    return trimmed;
  }

  function sanitizeBrokerLabel(value) {
    const collapsed = collapseRepeatedText(value);
    if (!collapsed) {
      return null;
    }

    if (/^(open|close)\s+account\s+manager$/i.test(collapsed)) {
      return null;
    }

    if (/^select\s+broker\s+dropdown$/i.test(collapsed)) {
      return null;
    }

    return collapsed.length >= 3 && collapsed.length <= 80 ? collapsed : null;
  }

  function sanitizeSymbolCandidate(value) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.replace(/\s+/g, "");
    if (!/^[A-Z0-9._!:/-]{2,24}$/i.test(normalized)) {
      return null;
    }

    const symbolOnly = normalized.includes(":") ? normalized.split(":").pop() : normalized;
    const cleaned = symbolOnly?.replace(/[^A-Z0-9._!/-]/gi, "").toUpperCase();
    return cleaned && /^[A-Z0-9._!/-]{2,20}$/.test(cleaned) ? cleaned : null;
  }

  function getHeaderSymbolCandidate() {
    const symbolButton = document.querySelector(TRADINGVIEW_SELECTORS.chartHeaderSymbolButton);
    if (!symbolButton) {
      return null;
    }

    return sanitizeSymbolCandidate(symbolButton.textContent);
  }

  function getCurrentSymbol() {
    const headerSymbol = getHeaderSymbolCandidate();
    if (headerSymbol) {
      return headerSymbol;
    }

    const exchangeMatch = document.title.match(/\b[A-Z0-9_]+:([A-Z0-9._!/-]{2,20})\b/i);
    if (exchangeMatch?.[1]) {
      return sanitizeSymbolCandidate(exchangeMatch[1]);
    }

    const titleParts = document.title
      .split(" - ")
      .map((part) => sanitizeSymbolCandidate(part))
      .filter(Boolean);

    if (titleParts.length) {
      return titleParts.sort((left, right) => left.length - right.length)[0];
    }

    return null;
  }

  function normalizeAccountLabel(parts) {
    const normalizedParts = parts
      .map((part) => collapseRepeatedText(part))
      .filter(Boolean);

    if (!normalizedParts.length) {
      return null;
    }

    if (normalizedParts.length >= 2 && /^[A-Z]{3,4}$/.test(normalizedParts[1])) {
      return `${normalizedParts[0]} ${normalizedParts[1]}`;
    }

    return normalizedParts.join(" ");
  }

  function sanitizeAccountName(value) {
    const trimmed = collapseRepeatedText(value);
    if (!trimmed || trimmed === FXCM_SIGNATURE.brokerLabel) {
      return null;
    }

    if (/^(open|close)\s+account\s+manager$/i.test(trimmed)) {
      return null;
    }

    if (/^select\s+broker\s+dropdown$/i.test(trimmed)) {
      return null;
    }

    if (/^(open|close|select)\s+broker/i.test(trimmed)) {
      return null;
    }

    if (/^(trading panel|account manager)$/i.test(trimmed)) {
      return null;
    }

    const accountWithCurrencyMatch = trimmed.match(/^(.+?)([A-Z]{3,4})$/);
    if (accountWithCurrencyMatch?.[1] && /\d/.test(accountWithCurrencyMatch[1])) {
      return accountWithCurrencyMatch[1];
    }

    return trimmed.length >= 3 && trimmed.length <= 80 ? trimmed : null;
  }

  function getAccountButton(accountManagerRegion, brokerSelectorButton) {
    if (!accountManagerRegion || !brokerSelectorButton) {
      return null;
    }

    const wrapper = brokerSelectorButton.parentElement?.parentElement;
    const siblingTextBlock = wrapper
      ? Array.from(wrapper.children).find((child) => child !== brokerSelectorButton.parentElement)
      : null;
    if (!siblingTextBlock) {
      return null;
    }

    return Array.from(siblingTextBlock.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") !== "Account settings",
    );
  }

  function getAccountNameFromRegion(accountManagerRegion) {
    if (!accountManagerRegion) {
      return null;
    }

    const brokerSelectorButton = accountManagerRegion.querySelector(TRADINGVIEW_SELECTORS.brokerSelectorButton);
    if (!brokerSelectorButton) {
      return null;
    }

    const accountButton = getAccountButton(accountManagerRegion, brokerSelectorButton);
    if (accountButton) {
      const accountName = sanitizeAccountName(accountButton.textContent);
      if (accountName) {
        return accountName;
      }
    }

    // TradingView nests the account identifier beside the broker selector inside the account header.
    // We keep this structural to avoid depending on hashed CSS classes.
    const wrapper = brokerSelectorButton.parentElement?.parentElement;
    const siblingTextBlock = wrapper
      ? Array.from(wrapper.children).find((child) => child !== brokerSelectorButton.parentElement)
      : null;

    if (!siblingTextBlock) {
      return null;
    }

    const childTextParts = Array.from(siblingTextBlock.children)
      .map((child) => child.textContent)
      .map((value) => value?.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const structuredLabel = normalizeAccountLabel(childTextParts);
    if (structuredLabel) {
      return sanitizeAccountName(structuredLabel);
    }

    return sanitizeAccountName(siblingTextBlock.textContent);
  }

  function getCurrentAccountName(accountManagerButton, accountManagerRegion) {
    const accountNameFromRegion = getAccountNameFromRegion(accountManagerRegion);
    if (accountNameFromRegion) {
      return accountNameFromRegion;
    }

    const candidates = [
      accountManagerButton?.textContent,
      accountManagerRegion?.textContent,
      accountManagerButton?.getAttribute("title"),
      accountManagerButton?.getAttribute("aria-label"),
    ];

    for (const candidate of candidates) {
      const accountName = sanitizeAccountName(candidate);
      if (accountName) {
        return accountName;
      }
    }

    return null;
  }

  function getElementLabel(element) {
    if (!element) {
      return "";
    }

    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function isRenderableElement(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle?.(element);
    return style?.display !== "none" && style?.visibility !== "hidden";
  }

  function findCandidateElements(scope, selector) {
    if (!scope) {
      return [];
    }

    return Array.from(scope.querySelectorAll(selector)).filter((node) => {
      const rect = typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null;
      return !rect || (rect.width >= 0 && rect.height >= 0);
    });
  }

  function findButtonsByText(scope, pattern) {
    if (!scope) {
      return [];
    }

    return Array.from(scope.querySelectorAll("button")).filter((button) => pattern.test(getElementLabel(button)));
  }

  function findTradeScope(tradingPanelRoot, accountManagerRegion) {
    return tradingPanelRoot || accountManagerRegion || document.body;
  }

  function findChartTradeButtons() {
    return {
      buyButton: document.querySelector(TRADINGVIEW_SELECTORS.chartBuyOrderButton),
      sellButton: document.querySelector(TRADINGVIEW_SELECTORS.chartSellOrderButton),
    };
  }

  function normalizeOrderType(value) {
    const text = value?.replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) {
      return null;
    }

    if (text.includes("stop limit")) {
      return "stop_limit";
    }
    if (text.includes("market")) {
      return "market";
    }
    if (text.includes("limit")) {
      return "limit";
    }
    if (text.includes("stop")) {
      return "stop";
    }

    return null;
  }

  function normalizeTradeSide(value) {
    const text = value?.replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) {
      return null;
    }

    if (text.includes("buy") || text.includes("long")) {
      return "buy";
    }
    if (text.includes("sell") || text.includes("short")) {
      return "sell";
    }

    return null;
  }

  function parseNumericValue(value) {
    const normalized = value?.replace(/,/g, "").trim();
    if (!normalized) {
      return null;
    }

    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }

    const parsed = Number.parseFloat(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeNotificationText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\b(Close)(Buy|Sell|Long|Short)\b/gi, "$1 $2")
      .replace(
        /\b((?:[A-Z0-9_]+:)?[A-Z0-9._!/-]{2,20})(Close)\s?(Buy|Sell|Long|Short)\b/g,
        "$1 $2 $3",
      )
      .replace(/\b((?:[A-Z0-9_]+:)?[A-Z0-9._!/-]{2,20})(Buy|Sell|Long|Short)\b/g, "$1 $2")
      .trim();
  }

  function getTradeSide(tradeScope) {
    const candidates = [
      ...findCandidateElements(tradeScope, TRADINGVIEW_SELECTORS.sideButtons),
      ...findButtonsByText(tradeScope, /\b(buy|sell)\b/i),
    ];
    const summaryButton = candidates.find((button) => /^(buy|sell)\s+\d/i.test(getElementLabel(button)));
    const selectedButton =
      summaryButton ||
      candidates.find((button) => button.getAttribute("aria-pressed") === "true") ||
      candidates.find((button) => /(buy|sell)/i.test(getElementLabel(button)));
    const label = getElementLabel(selectedButton);
    if (/buy/i.test(label)) {
      return "buy";
    }
    if (/sell/i.test(label)) {
      return "sell";
    }
    return null;
  }

  function getTradeOrderType(tradeScope) {
    const selectedTab = Array.from(tradeScope?.querySelectorAll?.('[role="tab"]') || []).find(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    const selectedTabOrderType = normalizeOrderType(getElementLabel(selectedTab));
    if (selectedTabOrderType) {
      return selectedTabOrderType;
    }

    const controls = findCandidateElements(tradeScope, TRADINGVIEW_SELECTORS.orderTypeControls);
    for (const control of controls) {
      const orderType = normalizeOrderType(getElementLabel(control));
      if (orderType) {
        return orderType;
      }
    }

    return null;
  }

  function getTradeQuantity(tradeScope) {
    const quantityInputs = findCandidateElements(tradeScope, TRADINGVIEW_SELECTORS.quantityInputs);
    for (const input of quantityInputs) {
      const quantity = parseNumericValue(input.value || input.getAttribute("value") || getElementLabel(input));
      if (quantity !== null) {
        return quantity;
      }
    }

    const summaryButton = findButtonsByText(tradeScope, /^(buy|sell)\s+\d/i)[0];
    const summaryText = getElementLabel(summaryButton);
    const summaryQuantityMatch = summaryText.match(/^(?:buy|sell)\s+(\d+(?:\.\d+)?)/i);
    if (summaryQuantityMatch?.[1]) {
      return parseNumericValue(summaryQuantityMatch[1]);
    }

    return null;
  }

  function getTradePrice(tradeScope) {
    const priceInputs = findCandidateElements(tradeScope, TRADINGVIEW_SELECTORS.priceInputs);
    for (const input of priceInputs) {
      const price = parseNumericValue(input.value || input.getAttribute("value") || getElementLabel(input));
      if (price !== null) {
        return price;
      }
    }

    const summaryButton = findButtonsByText(tradeScope, /@\s*[\d,.]+/i)[0];
    const summaryText = getElementLabel(summaryButton);
    const summaryPriceMatch = summaryText.match(/@\s*([\d,.]+)/i);
    if (summaryPriceMatch?.[1]) {
      return parseNumericValue(summaryPriceMatch[1]);
    }

    return null;
  }

  function getVisibleOrderSummary({ selectedSide, orderType, quantity, price }) {
    const parts = [selectedSide, orderType, quantity, price].filter((value) => value !== null && value !== undefined);
    if (!parts.length) {
      return null;
    }

    return parts.join(" ");
  }

  function getChartSurfaceText(chartRegion) {
    const chartSurface = chartRegion?.closest(TRADINGVIEW_SELECTORS.chartSurfaceRoot) || chartRegion;
    return chartSurface?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function getVisibleNotificationTexts() {
    const texts = [];
    const seen = new Set();

    function pushText(value) {
      const normalized = value?.replace(/\s+/g, " ").trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      texts.push(normalized);
    }

    Array.from(document.querySelectorAll(TRADINGVIEW_SELECTORS.tradingNotificationLogs))
      .filter(isRenderableElement)
      .forEach((element) => {
        pushText(element.innerText || element.textContent || "");
      });

    Array.from(document.querySelectorAll(TRADINGVIEW_SELECTORS.tradingNotificationToastButtons))
      .filter(isRenderableElement)
      .forEach((button) => {
        const controlledId = button.getAttribute("aria-controls");
        const controlledList = controlledId ? document.getElementById(controlledId) : null;
        const toastGroup =
          controlledList?.closest(TRADINGVIEW_SELECTORS.tradingNotificationToastGroups) ||
          button.closest(TRADINGVIEW_SELECTORS.tradingNotificationToastGroups);

        pushText(controlledList?.innerText || controlledList?.textContent || "");
        pushText(toastGroup?.innerText || toastGroup?.textContent || "");
      });

    Array.from(document.querySelectorAll(TRADINGVIEW_SELECTORS.tradingNotificationToastGroups))
      .filter(isRenderableElement)
      .forEach((element) => {
        const text = element.innerText || element.textContent || "";
        if (/\bMarket order (?:placed|executed|filled)\b/i.test(text)) {
          pushText(text);
        }
      });

    return texts;
  }

  function getChartExecutionNotificationSnapshot(currentSymbol) {
    const visibleTexts = getVisibleNotificationTexts().map((text) => normalizeNotificationText(text));
    const symbolPattern = currentSymbol
      ? currentSymbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "[A-Z0-9._!/-]{2,20}";
    const notificationPattern = new RegExp(
      String.raw`((?:market|limit|stop(?: limit)?)\s+order\s+(?:executed|filled))\s+on\s+(?:[A-Z0-9_]+:)?(${symbolPattern})\s+(Buy|Sell|Long|Short)\s+([\d,]+(?:\.\d+)?)\s+at\s+([\d,]+(?:\.\d+)?)`,
      "i",
    );

    const latestMatch = [...visibleTexts]
      .reverse()
      .map((text) => ({ text, match: text.match(notificationPattern) }))
      .find((entry) => entry.match);

    if (!latestMatch?.match) {
      return {
        visible: false,
        orderType: null,
        summary: null,
        symbol: null,
        side: null,
        quantity: null,
        price: null,
      };
    }

    return {
      visible: true,
      orderType: normalizeOrderType(latestMatch.match[1]),
      summary: latestMatch.text,
      symbol: sanitizeSymbolCandidate(latestMatch.match[2]),
      side: normalizeTradeSide(latestMatch.match[3]),
      quantity: parseNumericValue(latestMatch.match[4]),
      price: parseNumericValue(latestMatch.match[5]),
    };
  }

  function getChartPositionObjectSnapshot(chartRegion, currentSymbol) {
    const chartText = getChartSurfaceText(chartRegion);
    if (!chartText) {
      return {
        size: null,
        side: null,
        pnl: null,
        sourceSurface: null,
        summary: null,
        objectVisible: false,
      };
    }

    const actionButtons = Array.from(document.querySelectorAll(TRADINGVIEW_SELECTORS.chartPositionActionButtons)).filter(
      isRenderableElement,
    );
    const hasPositionActions = actionButtons.length > 0;
    const positionKeywords = /(protect position|close position|reverse position|take profit|stop loss|break-even|breakeven|p&l|profit|loss)/i;
    if (!hasPositionActions && !positionKeywords.test(chartText)) {
      return {
        size: null,
        side: null,
        pnl: null,
        sourceSurface: null,
        summary: null,
        objectVisible: false,
      };
    }

    const symbolPattern = currentSymbol
      ? currentSymbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "[A-Z0-9._!/-]{2,20}";
    const directPositionMatch = chartText.match(
      new RegExp(
        String.raw`(?:FX:)?${symbolPattern}\b.*?\b(Long|Short|Buy|Sell)\b(?:\D{0,20}Qty|\D{0,20}Quantity|\D{0,20}Contracts|\D{0,20}Units|\D{0,20})\s*(-?\d+(?:\.\d+)?)`,
        "i",
      ),
    );
    const pnlMatch =
      chartText.match(/\b(?:P&L|Profit|Loss)\b\D{0,12}([+\-−]?\d+(?:\.\d+)?)/i) ||
      chartText.match(/\b(?:Unrealized P&L)\b\D{0,12}([+\-−]?\d+(?:\.\d+)?)/i);

    return {
      size: directPositionMatch ? parseNumericValue(directPositionMatch[2]) : null,
      side: directPositionMatch ? normalizeTradeSide(directPositionMatch[1]) : null,
      pnl: pnlMatch ? parseNumericValue(pnlMatch[1].replace("−", "-")) : null,
      sourceSurface: hasPositionActions || directPositionMatch ? "chart_position_object" : null,
      summary: (hasPositionActions ? actionButtons.map(getElementLabel).join(" | ") : chartText).slice(0, 240) || null,
      objectVisible: hasPositionActions || Boolean(directPositionMatch),
    };
  }

  function getAccountSurfacePositionSupport(accountManagerRegion) {
    if (!accountManagerRegion || !isRenderableElement(accountManagerRegion)) {
      return {
        active: false,
        pnl: null,
        margin: null,
        summary: null,
      };
    }

    const regionText = accountManagerRegion.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!regionText) {
      return {
        active: false,
        pnl: null,
        margin: null,
        summary: null,
      };
    }

    const pnlMatch = regionText.match(/\bUnrealized P&L\b\D{0,12}([+\-−]?\d+(?:\.\d+)?)/i);
    const marginMatch = regionText.match(/\bAccount margin\b\D{0,12}([+\-−]?\d+(?:\.\d+)?)/i);
    const positionCountMatch = regionText.match(/\bPositions?\s+(\d+)/i);
    const pnl = pnlMatch ? parseNumericValue(pnlMatch[1].replace("−", "-")) : null;
    const margin = marginMatch ? parseNumericValue(marginMatch[1].replace("−", "-")) : null;
    const positionsCount = positionCountMatch ? parseNumericValue(positionCountMatch[1]) : null;
    const active = Boolean((positionsCount || 0) > 0 || (margin || 0) > 0 || pnl !== null);

    return {
      active,
      pnl,
      margin,
      summary: active ? regionText.slice(0, 240) : null,
    };
  }

  function getVisiblePositionSnapshot(positionsTable) {
    if (!positionsTable) {
      return {
        size: null,
        side: null,
        sourceSurface: null,
      };
    }

    const rows = Array.from(positionsTable.querySelectorAll("tbody tr"))
      .map((row) => Array.from(row.querySelectorAll("td")))
      .filter((cells) => cells.length >= 3);

    if (!rows.length) {
      return {
        size: null,
        side: null,
        sourceSurface: null,
      };
    }

    const firstRow = rows.find((row) => row.some((cell) => sanitizeSymbolCandidate(cell.textContent || "")));
    if (!firstRow) {
      return {
        size: null,
        side: null,
        sourceSurface: null,
      };
    }

    const symbolText = firstRow[0]?.textContent || "";
    const sideText = firstRow[1]?.textContent || "";
    const qtyText = firstRow[2]?.textContent || "";
    const symbol = sanitizeSymbolCandidate(symbolText);
    const side = normalizeTradeSide(sideText);
    const size = parseNumericValue(qtyText);

    return {
      symbol,
      size,
      side,
      sourceSurface: "position_table",
    };
  }

  function getBodyPositionSnapshot(currentSymbol) {
    const bodyText = document.body?.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!bodyText || !/\bpositions?\s+\d+/i.test(bodyText)) {
      return {
        size: null,
        side: null,
        sourceSurface: null,
      };
    }

    const symbolPattern = currentSymbol ? currentSymbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[A-Z0-9._!/-]{2,20}";
    const positionMatch = bodyText.match(
      new RegExp(`(?:FX:)?${symbolPattern}\\b.*?\\b(Long|Short|Buy|Sell)\\b\\s*(-?\\d+(?:\\.\\d+)?)`, "i"),
    );

    if (!positionMatch) {
      return {
        size: null,
        side: null,
        sourceSurface: null,
      };
    }

    return {
      size: parseNumericValue(positionMatch[2]),
      side: normalizeTradeSide(positionMatch[1]),
      sourceSurface: "account_surface_text",
    };
  }

  function getPositionSnapshot(chartRegion, accountManagerRegion, positionsTable, currentSymbol) {
    const chartPositionSnapshot = getChartPositionObjectSnapshot(chartRegion, currentSymbol);
    if (chartPositionSnapshot.size !== null || chartPositionSnapshot.side !== null) {
      return chartPositionSnapshot;
    }

    if (accountManagerRegion) {
      const regionText = accountManagerRegion.textContent?.replace(/\s+/g, " ").trim() || "";
      if (/\bposition/i.test(regionText)) {
        const sideMatch = regionText.match(/\b(buy|sell|long|short)\b/i);
        const sizeMatch =
          regionText.match(/\b(?:position|positions|qty|quantity|size)\D{0,12}(-?\d+(?:\.\d+)?)\b/i) ||
          regionText.match(/\b(buy|sell|long|short)\b\D{0,12}(-?\d+(?:\.\d+)?)\b/i);

        const regionSnapshot = {
          size: sizeMatch ? parseNumericValue(sizeMatch[1] || sizeMatch[2]) : null,
          side: sideMatch ? sideMatch[1].toLowerCase().replace("long", "buy").replace("short", "sell") : null,
          sourceSurface: "account_manager_summary",
        };
        if (regionSnapshot.size !== null || regionSnapshot.side !== null) {
          return regionSnapshot;
        }
      }
    }

    const visiblePositionSnapshot = getVisiblePositionSnapshot(positionsTable);
    if (visiblePositionSnapshot.size !== null || visiblePositionSnapshot.side !== null) {
      return visiblePositionSnapshot;
    }

    const bodySnapshot = getBodyPositionSnapshot(currentSymbol);
    if (bodySnapshot.size !== null || bodySnapshot.side !== null) {
      return bodySnapshot;
    }

    return {
      size: null,
      side: null,
      sourceSurface: null,
    };
  }

  function getChartPlanningTool(tradeScope) {
    if (tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoCreateLongPositionButton)) {
      return "long";
    }

    if (tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoCreateShortPositionButton)) {
      return "short";
    }

    if (tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoRemoveLongPositionButton)) {
      return "long";
    }

    if (tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoRemoveShortPositionButton)) {
      return "short";
    }

    return null;
  }

  function getChartPlanningAction(tradeScope) {
    if (
      tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoRemoveLongPositionButton) ||
      tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoRemoveShortPositionButton)
    ) {
      return "remove";
    }

    if (
      tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoCreateLongPositionButton) ||
      tradeScope?.querySelector(TRADINGVIEW_SELECTORS.undoCreateShortPositionButton)
    ) {
      return "create";
    }

    return null;
  }

  function getChartPlanningState(tradeScope) {
    if (!tradeScope) {
      return {
        objectVisible: false,
        tool: null,
        limitOrderVisible: false,
        settingsVisible: false,
        removeVisible: false,
        moreVisible: false,
        summary: null,
      };
    }

    const drawingToolbar = tradeScope.querySelector(TRADINGVIEW_SELECTORS.drawingToolbar);
    const createLimitOrderControl = tradeScope.querySelector(TRADINGVIEW_SELECTORS.createLimitOrderControl);
    const planningSettingsButton = tradeScope.querySelector(TRADINGVIEW_SELECTORS.planningSettingsButton);
    const planningRemoveButton = tradeScope.querySelector(TRADINGVIEW_SELECTORS.planningRemoveButton);
    const planningMoreButton = tradeScope.querySelector(TRADINGVIEW_SELECTORS.planningMoreButton);
    const tool = getChartPlanningTool(tradeScope);
    const recentAction = getChartPlanningAction(tradeScope);
    const limitOrderVisible = Boolean(createLimitOrderControl);
    const settingsVisible = Boolean(planningSettingsButton);
    const removeVisible = Boolean(planningRemoveButton);
    const moreVisible = Boolean(planningMoreButton);
    const objectVisible = Boolean(
      drawingToolbar || limitOrderVisible || settingsVisible || removeVisible || moreVisible,
    );

    return {
      objectVisible,
      tool,
      recentAction,
      limitOrderVisible,
      settingsVisible,
      removeVisible,
      moreVisible,
      summary: objectVisible
        ? [
            tool || "position",
            recentAction || "",
            limitOrderVisible ? "limit" : "",
            settingsVisible ? "settings" : "",
            removeVisible ? "remove" : "",
            moreVisible ? "more" : "",
          ]
            .filter(Boolean)
            .join("|")
        : null,
    };
  }

  function collectDomState({ footerSearchDepth }) {
    const pageMatch = getTradingViewPageMatch(window.location);
    const tradingPanelRoot = document.querySelector(TRADINGVIEW_SELECTORS.tradingPanelRoot);
    const accountManagerButton = document.querySelector(TRADINGVIEW_SELECTORS.accountManagerButton);
    const accountManagerRegion = document.querySelector(TRADINGVIEW_SELECTORS.accountManagerRegion);
    const brokerSelectorButton = document.querySelector(TRADINGVIEW_SELECTORS.brokerSelectorButton);
    const orderEntryButton = document.querySelector(TRADINGVIEW_SELECTORS.orderEntryButton);
    const panelOpenButton = document.querySelector(TRADINGVIEW_SELECTORS.panelOpenButton);
    const panelMaximizeButton = document.querySelector(TRADINGVIEW_SELECTORS.panelMaximizeButton);
    const topTradeButton = document.querySelector(TRADINGVIEW_SELECTORS.topTradeButton);
    const chartRegion = document.querySelector(TRADINGVIEW_SELECTORS.chartRegion);
    const chartCanvas = document.querySelector(TRADINGVIEW_SELECTORS.chartCanvas);
    const positionsTable = document.querySelector(TRADINGVIEW_SELECTORS.positionsTable);
    const longPositionToolButton = document.querySelector(TRADINGVIEW_SELECTORS.longPositionToolButton);
    const shortPositionToolButton = document.querySelector(TRADINGVIEW_SELECTORS.shortPositionToolButton);
    const removeObjectsButton = document.querySelector(TRADINGVIEW_SELECTORS.removeObjectsButton);
    const { buyButton: chartBuyOrderButton, sellButton: chartSellOrderButton } = findChartTradeButtons();
    const brokerLabelNodes = findTextMatches(FXCM_SIGNATURE.brokerLabel);
    const footerCluster = findFooterCluster(
      [
        accountManagerButton,
        accountManagerRegion,
        orderEntryButton,
        panelOpenButton,
        panelMaximizeButton,
        topTradeButton,
        ...brokerLabelNodes,
      ],
      footerSearchDepth,
    );
    const brokerLabel = getBrokerLabel();
    const currentSymbol = getCurrentSymbol();
    const currentAccountName = getCurrentAccountName(accountManagerButton, accountManagerRegion);
    const tradeScope = findTradeScope(tradingPanelRoot, accountManagerRegion);
    const selectedTradeSide = getTradeSide(tradeScope);
    const detectedOrderType = getTradeOrderType(tradeScope);
    const detectedQuantity = getTradeQuantity(tradeScope);
    const detectedPrice = getTradePrice(tradeScope);
    const chartPlanningState = getChartPlanningState(document.body);
    const chartExecutionNotification = getChartExecutionNotificationSnapshot(currentSymbol);
    const chartPositionSnapshot = getChartPositionObjectSnapshot(chartRegion, currentSymbol);
    const accountPositionSupport = getAccountSurfacePositionSupport(accountManagerRegion);
    const submitButtons = [
      ...findCandidateElements(tradeScope, TRADINGVIEW_SELECTORS.submitButtons),
      ...findButtonsByText(tradeScope, /\b(buy|sell|place|submit)\b/i),
    ];
    const cancelButtons = [
      ...findCandidateElements(tradeScope, TRADINGVIEW_SELECTORS.cancelButtons),
      ...findButtonsByText(tradeScope, /\b(cancel|remove)\b/i),
    ];
    const positionSnapshot = getPositionSnapshot(chartRegion, accountManagerRegion, positionsTable, currentSymbol);
    const tradeTabsVisible = Boolean((tradeScope?.querySelectorAll?.('[role="tab"]') || []).length);
    // TradingView frequently remounts the footer as sibling islands instead of one stable subtree.
    // We therefore treat FXCM connectivity as a deterministic multi-signal signature rather than
    // requiring every anchor to coexist under the same parent at the same moment.
    const brokerSignature = resolveBrokerSignature({
      hasBrokerLabel: Boolean(brokerLabel),
      hasAccountManager: Boolean(accountManagerButton || accountManagerRegion),
      hasOrderEntry: Boolean(orderEntryButton),
      hasTopTradeControl: Boolean(topTradeButton),
      hasPanelOpenControl: Boolean(panelOpenButton),
      hasPanelMaximizeControl: Boolean(panelMaximizeButton),
      hasTradingPanelRoot: Boolean(tradingPanelRoot),
      hasFooterCluster: Boolean(footerCluster),
    });

    const snapshot = {
      generic: {
        is_tradingview_chart: pageMatch.isTradingViewChart,
        trading_surface_visible: Boolean(chartRegion || topTradeButton || tradingPanelRoot),
        trading_panel_visible: Boolean(tradingPanelRoot),
        current_symbol: currentSymbol,
        document_hidden: document.hidden,
        visibility_state: document.visibilityState || "visible",
        account_manager_entrypoint_visible: Boolean(accountManagerButton),
        broker_selector_visible: Boolean(brokerSelectorButton),
        order_entry_control_visible: Boolean(orderEntryButton),
        panel_open_control_visible: Boolean(panelOpenButton),
        panel_maximize_control_visible: Boolean(panelMaximizeButton),
        chart_trade_controls_visible: Boolean(chartBuyOrderButton || chartSellOrderButton),
        chart_buy_control_visible: Boolean(chartBuyOrderButton),
        chart_sell_control_visible: Boolean(chartSellOrderButton),
        chart_canvas_visible: Boolean(chartCanvas || chartRegion),
        long_position_tool_visible: Boolean(longPositionToolButton),
        short_position_tool_visible: Boolean(shortPositionToolButton),
        remove_objects_control_visible: Boolean(removeObjectsButton),
      },
      broker: {
        broker_connected: brokerSignature.brokerConnected,
        broker_label: brokerLabel,
        current_account_name: currentAccountName,
        fxcm_footer_cluster_visible:
          brokerLabel === FXCM_SIGNATURE.brokerLabel && brokerSignature.footerClusterVisible,
        anchor_summary: {
          trading_panel_root: Boolean(tradingPanelRoot),
          footer_cluster_visible: brokerLabel === FXCM_SIGNATURE.brokerLabel && brokerSignature.footerClusterVisible,
          account_manager_control: Boolean(accountManagerButton || accountManagerRegion),
          // This button has been the most fragile FXCM-specific anchor so far because some layouts
          // expose its label via `title` instead of `aria-label`.
          order_entry_control: Boolean(orderEntryButton),
          panel_open_control: Boolean(panelOpenButton),
          panel_maximize_control: Boolean(panelMaximizeButton),
          top_trade_control: Boolean(topTradeButton),
          broker_label_text: Boolean(brokerLabel),
        },
      },
      trade: {
        ticket_visible: Boolean((tradingPanelRoot && (tradeTabsVisible || submitButtons.length || detectedOrderType)) || orderEntryButton),
        order_visible: Boolean(submitButtons.length),
        submit_control_visible: Boolean(submitButtons.length),
        cancel_control_visible: Boolean(cancelButtons.length),
        selected_side: selectedTradeSide,
        order_type: detectedOrderType,
        quantity: detectedQuantity,
        price: detectedPrice,
        position_size: positionSnapshot.size,
        position_side: positionSnapshot.side,
        position_source_surface: positionSnapshot.sourceSurface,
        chart_position_object_visible: chartPositionSnapshot.objectVisible,
        chart_position_summary: chartPositionSnapshot.summary,
        chart_position_pnl: chartPositionSnapshot.pnl,
        chart_position_notification_visible: chartExecutionNotification.visible,
        chart_position_notification_summary: chartExecutionNotification.summary,
        chart_position_notification_symbol: chartExecutionNotification.symbol,
        chart_position_notification_side: chartExecutionNotification.side,
        chart_position_notification_quantity: chartExecutionNotification.quantity,
        chart_position_notification_price: chartExecutionNotification.price,
        chart_position_notification_order_type: chartExecutionNotification.orderType,
        chart_position_support_active:
          chartPositionSnapshot.objectVisible || chartExecutionNotification.visible || accountPositionSupport.active,
        chart_position_support_summary:
          chartPositionSnapshot.summary || chartExecutionNotification.summary || accountPositionSupport.summary,
        visible_order_summary: getVisibleOrderSummary({
          selectedSide: selectedTradeSide,
          orderType: detectedOrderType,
          quantity: detectedQuantity,
          price: detectedPrice,
        }),
        chart_trade_controls_visible: Boolean(chartBuyOrderButton || chartSellOrderButton),
        chart_buy_control_visible: Boolean(chartBuyOrderButton),
        chart_sell_control_visible: Boolean(chartSellOrderButton),
        chart_planning_object_visible: chartPlanningState.objectVisible,
        chart_planning_tool: chartPlanningState.tool,
        chart_planning_recent_action: chartPlanningState.recentAction,
        chart_planning_limit_order_visible: chartPlanningState.limitOrderVisible,
        chart_planning_settings_visible: chartPlanningState.settingsVisible,
        chart_planning_remove_visible: chartPlanningState.removeVisible,
        chart_planning_more_visible: chartPlanningState.moreVisible,
        chart_planning_summary: chartPlanningState.summary,
      },
    };

    return {
      snapshot,
      roots: {
        tradingPanelRoot,
        footerCluster,
        accountManagerButton,
        accountManagerRegion,
        orderEntryButton,
        panelOpenButton,
        panelMaximizeButton,
        topTradeButton,
      },
    };
  }

  global.TiltGuardContent.collectDomState = collectDomState;
})(globalThis);
