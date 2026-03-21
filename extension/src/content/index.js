(function startContentScript(global) {
  const { createLogger, createTradingViewObserver, getTradingViewPageMatch } = global.TiltGuardContent;
  const logger = createLogger("content");

  if (!getTradingViewPageMatch(window.location).isTradingViewChart) {
    logger.debug("page_skipped", { url: window.location.href });
    return;
  }

  const observer = createTradingViewObserver({
    onEvents(events, snapshot) {
      chrome.runtime.sendMessage({
        type: "telemetry:observed",
        payload: {
          events,
          snapshot,
          pageUrl: window.location.href,
          pageTitle: document.title,
        },
      });
    },
  });

  observer.start();
  window.addEventListener("beforeunload", () => observer.stop(), { once: true });
  logger.info("observer_started", { url: window.location.href });
})(globalThis);
