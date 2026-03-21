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
    return findTextMatches(FXCM_SIGNATURE.brokerLabel).length ? FXCM_SIGNATURE.brokerLabel : null;
  }

  function collectDomState({ footerSearchDepth }) {
    const pageMatch = getTradingViewPageMatch(window.location);
    const tradingPanelRoot = document.querySelector(TRADINGVIEW_SELECTORS.tradingPanelRoot);
    const accountManagerButton = document.querySelector(TRADINGVIEW_SELECTORS.accountManagerButton);
    const accountManagerRegion = document.querySelector(TRADINGVIEW_SELECTORS.accountManagerRegion);
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
    // TradingView frequently remounts the footer as sibling islands instead of one stable subtree.
    // We therefore treat FXCM connectivity as a deterministic multi-signal signature rather than
    // requiring every anchor to coexist under the same parent at the same moment.
    const brokerSignature = resolveBrokerSignature({
      hasBrokerLabel: brokerLabel === FXCM_SIGNATURE.brokerLabel,
      hasAccountManager: Boolean(accountManagerButton || accountManagerRegion),
      hasOrderEntry: Boolean(orderEntryButton),
      hasTopTradeControl: Boolean(topTradeButton),
      hasPanelOpenControl: Boolean(panelOpenButton),
      hasPanelMaximizeControl: Boolean(panelMaximizeButton),
      hasTradingPanelRoot: Boolean(tradingPanelRoot),
      hasFooterCluster: Boolean(footerCluster),
    });

    const snapshot = {
      is_tradingview_chart: pageMatch.isTradingViewChart,
      trading_surface_visible: Boolean(chartRegion || topTradeButton || tradingPanelRoot),
      trading_panel_visible: Boolean(tradingPanelRoot),
      broker_connected: brokerSignature.brokerConnected,
      broker_label: brokerLabel,
      account_manager_control_visible: Boolean(accountManagerButton || accountManagerRegion),
      order_entry_control_visible: Boolean(orderEntryButton),
      panel_open_control_visible: Boolean(panelOpenButton),
      panel_maximize_control_visible: Boolean(panelMaximizeButton),
      fxcm_footer_cluster_visible: brokerSignature.footerClusterVisible,
      anchor_summary: {
        trading_panel_root: Boolean(tradingPanelRoot),
        footer_cluster_visible: brokerSignature.footerClusterVisible,
        account_manager_control: Boolean(accountManagerButton || accountManagerRegion),
        // This button has been the most fragile FXCM-specific anchor so far because some layouts
        // expose its label via `title` instead of `aria-label`.
        order_entry_control: Boolean(orderEntryButton),
        panel_open_control: Boolean(panelOpenButton),
        panel_maximize_control: Boolean(panelMaximizeButton),
        top_trade_control: Boolean(topTradeButton),
        broker_label_text: brokerLabel === FXCM_SIGNATURE.brokerLabel,
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
