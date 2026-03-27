export const MAX_TELEMETRY_QUEUE_EVENTS = 150;

export function limitTelemetryQueue(queue, maxEvents = MAX_TELEMETRY_QUEUE_EVENTS) {
  if (!Array.isArray(queue)) {
    return [];
  }

  if (queue.length <= maxEvents) {
    return queue;
  }

  return queue.slice(queue.length - maxEvents);
}

export function isQuotaExceededError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /quota exceeded|kQuotaBytes/i.test(message);
}
