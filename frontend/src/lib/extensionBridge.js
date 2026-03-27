export function canTalkToExtension() {
  return typeof window !== "undefined" && Boolean(window.chrome?.runtime?.sendMessage);
}

export function shouldResyncExtensionAuth({
  extensionSession,
  hasExtensionMessaging,
  lastAttemptAt = 0,
  now = Date.now(),
  cooldownMs = 15_000,
}) {
  if (!hasExtensionMessaging || !extensionSession?.extension_id) {
    return false;
  }

  const status = extensionSession.status || "";
  const isRecoverableStatus = status === "offline" || status === "disconnected";
  if (!isRecoverableStatus) {
    return false;
  }

  return now - lastAttemptAt >= cooldownMs;
}

export async function syncExtensionAuth({ extensionId, accessToken, userEmail }) {
  if (!canTalkToExtension()) {
    throw new Error("This browser cannot message the Tilt Guard extension.");
  }

  if (!extensionId) {
    throw new Error("Missing extension ID.");
  }

  return new Promise((resolve, reject) => {
    window.chrome.runtime.sendMessage(
      extensionId,
      {
        type: "tiltguard:auth-sync",
        payload: {
          accessToken,
          userEmail,
        },
      },
      (response) => {
        const runtimeError = window.chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "Extension auth sync failed."));
          return;
        }

        resolve(response);
      },
    );
  });
}
