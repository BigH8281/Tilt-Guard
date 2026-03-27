const test = require("node:test");
const assert = require("node:assert/strict");

test("treats 401 and 403 as extension auth failures", async () => {
  const { isAuthFailureStatus } = await import("../src/background/auth-recovery.js");

  assert.equal(isAuthFailureStatus(401), true);
  assert.equal(isAuthFailureStatus(403), true);
  assert.equal(isAuthFailureStatus(500), false);
});

test("retains only a small recent queue window during auth recovery", async () => {
  const { trimQueueForAuthRecovery } = await import("../src/background/auth-recovery.js");
  const queue = Array.from({ length: 60 }, (_, index) => ({ event_id: `event-${index + 1}` }));

  const trimmed = trimQueueForAuthRecovery(queue, 25);

  assert.equal(trimmed.length, 25);
  assert.equal(trimmed[0].event_id, "event-36");
  assert.equal(trimmed[24].event_id, "event-60");
});
