function canTalkToExtension() {
  return typeof window !== "undefined" && Boolean(window.chrome?.runtime?.sendMessage);
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
