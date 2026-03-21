(function attachBrokerSignature(globalScope) {
  function countDistinctSignals(flags) {
    return flags.filter(Boolean).length;
  }

  function resolveBrokerSignature({
    hasBrokerLabel,
    hasAccountManager,
    hasOrderEntry,
    hasTopTradeControl,
    hasPanelOpenControl,
    hasPanelMaximizeControl,
    hasTradingPanelRoot,
    hasFooterCluster,
  }) {
    const hasTradingControl = Boolean(hasOrderEntry || hasTopTradeControl);
    const hasPanelControl = Boolean(hasPanelOpenControl || hasPanelMaximizeControl);
    const brokerSignalCount = countDistinctSignals([
      hasBrokerLabel,
      hasAccountManager,
      hasTradingControl,
      hasPanelControl,
      hasTradingPanelRoot,
    ]);

    return {
      brokerSignalCount,
      hasTradingControl,
      hasPanelControl,
      footerClusterVisible: Boolean(
        hasFooterCluster || (hasBrokerLabel && hasAccountManager && (hasTradingControl || hasPanelControl)),
      ),
      brokerConnected: Boolean(
        hasBrokerLabel &&
          brokerSignalCount >= 4 &&
          hasAccountManager &&
          (hasTradingControl || hasPanelControl),
      ),
    };
  }

  globalScope.TiltGuardShared = globalScope.TiltGuardShared || {};
  globalScope.TiltGuardShared.countDistinctSignals = countDistinctSignals;
  globalScope.TiltGuardShared.resolveBrokerSignature = resolveBrokerSignature;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      countDistinctSignals,
      resolveBrokerSignature,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
