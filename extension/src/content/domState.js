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
