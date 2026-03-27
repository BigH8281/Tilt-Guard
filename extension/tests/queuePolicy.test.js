const test = require("node:test");
const assert = require("node:assert/strict");

test("limits the persisted telemetry queue to the newest events", async () => {
  const { limitTelemetryQueue } = await import("../src/background/queue-policy.js");
  const queue = Array.from({ length: 200 }, (_, index) => ({ event_id: `event-${index + 1}` }));

  const limited = limitTelemetryQueue(queue, 150);

  assert.equal(limited.length, 150);
  assert.equal(limited[0].event_id, "event-51");
  assert.equal(limited[149].event_id, "event-200");
});

test("detects quota exceeded errors from Chrome storage", async () => {
  const { isQuotaExceededError } = await import("../src/background/queue-policy.js");

  assert.equal(isQuotaExceededError(new Error("Resource::kQuotaBytes quota exceeded")), true);
  assert.equal(isQuotaExceededError(new Error("other failure")), false);
});
