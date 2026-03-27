/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { shouldResyncExtensionAuth } from "./extensionBridge";

describe("shouldResyncExtensionAuth", () => {
  it("requests auth recovery when an active extension session is offline", () => {
    expect(
      shouldResyncExtensionAuth({
        extensionSession: {
          extension_id: "abc123",
          status: "offline",
        },
        hasExtensionMessaging: true,
        lastAttemptAt: 0,
        now: 30_000,
      }),
    ).toBe(true);
  });

  it("suppresses repeated retries inside the cooldown window", () => {
    expect(
      shouldResyncExtensionAuth({
        extensionSession: {
          extension_id: "abc123",
          status: "offline",
        },
        hasExtensionMessaging: true,
        lastAttemptAt: 25_000,
        now: 30_000,
      }),
    ).toBe(false);
  });

  it("does not resync healthy or missing sessions", () => {
    expect(
      shouldResyncExtensionAuth({
        extensionSession: {
          extension_id: "abc123",
          status: "live",
        },
        hasExtensionMessaging: true,
      }),
    ).toBe(false);

    expect(
      shouldResyncExtensionAuth({
        extensionSession: null,
        hasExtensionMessaging: true,
      }),
    ).toBe(false);
  });
});
