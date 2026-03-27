(function startContentScript(global) {
  const { createLogger, createTradingViewObserver, getTradingViewPageMatch } = global.TiltGuardContent;
  const logger = createLogger("content");

  function isExpectedSendFailure(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return [
      "Extension context invalidated.",
      "The message port closed before a response was received.",
      "Could not establish connection. Receiving end does not exist.",
    ].some((fragment) => message.includes(fragment));
  }

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
          const errorMessage = error instanceof Error ? error.message : String(error);
          const context = { error: errorMessage, eventCount: events.length };
          if (isExpectedSendFailure(error)) {
            logger.info("telemetry_send_skipped", context);
            window.setTimeout(() => {
              observer.collectNow("send_retry");
            }, 1000);
            return;
          }

          logger.warn("telemetry_send_failed", context);
        }
      })();
    },
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "telemetry:collect-now") {
      observer.collectNow(message.reason || "background_probe");
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  observer.start();
  window.addEventListener("beforeunload", () => observer.stop(), { once: true });
  logger.info("observer_started", { url: window.location.href });
})(globalThis);
