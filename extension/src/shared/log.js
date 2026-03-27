const PREFIX = "[tilt-guard]";

export function createLogger(scope) {
  function stringifyContext(context) {
    const entries = Object.entries(context || {}).filter(([, value]) => value !== undefined);
    if (!entries.length) {
      return "";
    }

    try {
      return ` ${JSON.stringify(Object.fromEntries(entries))}`;
    } catch {
      return ` ${String(context)}`;
    }
  }

  function log(level, message, context = {}) {
    const method = console[level] || console.log;
    method(`${PREFIX} ${scope}:${message}${stringifyContext(context)}`);
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
