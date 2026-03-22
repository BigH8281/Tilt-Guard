const PREFIX = "[tilt-guard]";

export function createLogger(scope) {
  function log(level, message, context = {}) {
    const payload = {
      scope,
      message,
      ...context,
    };
    const method = console[level] || console.log;
    method(PREFIX, payload);
  }

  return {
    debug(message, context) {
      log("debug", message, context);
    },
    info(message, context) {
      log("info", message, context);
    },
    warn(message, context) {
      log("warn", message, context);
    },
    error(message, context) {
      log("error", message, context);
    },
  };
}
