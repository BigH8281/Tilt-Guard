(function attachRefreshPolicy(global) {
  function shouldEmitSnapshotRefresh({
    reason,
    documentHidden = false,
    lastRefreshEventAt = 0,
    now = Date.now(),
    refreshIntervalMs = 15_000,
    symbolChanged = false,
    titleChanged = false,
    urlChanged = false,
    tradingPanelStateChanged = false,
  }) {
    if (symbolChanged || titleChanged || urlChanged || tradingPanelStateChanged) {
      return true;
    }

    if (documentHidden) {
      return false;
    }

    if (reason === "focus" || reason === "visibility" || reason === "pageshow" || reason === "navigation") {
      return true;
    }

    if (reason !== "heartbeat") {
      return false;
    }

    return now - lastRefreshEventAt >= refreshIntervalMs;
  }

  function buildSnapshotRefreshDetails({
    reason,
    changedFields,
    previousSymbol,
    currentSymbol,
    previousPageTitle,
    pageTitle,
    previousPageUrl,
    pageUrl,
    tradingPanelStateChanged,
  }) {
    return {
      reason,
      changed_fields: changedFields,
      symbol_changed: previousSymbol !== currentSymbol,
      previous_symbol: previousSymbol || null,
      current_symbol: currentSymbol || null,
      page_title_changed: previousPageTitle !== pageTitle,
      previous_page_title: previousPageTitle || null,
      page_title: pageTitle,
      page_url_changed: previousPageUrl !== pageUrl,
      previous_page_url: previousPageUrl || null,
      page_url: pageUrl,
      trading_panel_state_changed: tradingPanelStateChanged,
    };
  }

  global.TiltGuardContent = global.TiltGuardContent || {};
  global.TiltGuardContent.shouldEmitSnapshotRefresh = shouldEmitSnapshotRefresh;
  global.TiltGuardContent.buildSnapshotRefreshDetails = buildSnapshotRefreshDetails;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      shouldEmitSnapshotRefresh,
      buildSnapshotRefreshDetails,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
