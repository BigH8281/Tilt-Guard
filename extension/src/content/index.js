(function startContentScript(global) {
  const { createLogger, createTradingViewObserver, getTradingViewPageMatch } = global.TiltGuardContent;
  const logger = createLogger("content");

  if (!getTradingViewPageMatch(window.location).isTradingViewChart) {
    logger.debug("page_skipped", { url: window.location.href });
    return;
  }

  const observer = createTradingViewObserver({
    onEvents(events, snapshot, adapter) {
      void (async () => {
        try {
          await chrome.runtime.sendMessage({
            type: "telemetry:observed",
            payload: {
              events,
              snapshot,
              adapter,
              pageUrl: window.location.href,
              pageTitle: document.title,
            },
          });
        } catch (error) {
          logger.warn("telemetry_send_failed", {
            error: error instanceof Error ? error.message : String(error),
            eventCount: events.length,
          });
        }
      })();
    },
  });

  observer.start();
  window.addEventListener("beforeunload", () => observer.stop(), { once: true });
  logger.info("observer_started", { url: window.location.href });
})(globalThis);
