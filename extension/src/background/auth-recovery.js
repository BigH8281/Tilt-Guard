import { limitTelemetryQueue } from "./queue-policy.js";

export const AUTH_RECOVERY_QUEUE_EVENTS = 25;

export function isAuthFailureStatus(status) {
  const numericStatus = Number(status);
  return numericStatus === 401 || numericStatus === 403;
}

export function trimQueueForAuthRecovery(queue, retainRecentEvents = AUTH_RECOVERY_QUEUE_EVENTS) {
  return limitTelemetryQueue(queue, retainRecentEvents);
}
