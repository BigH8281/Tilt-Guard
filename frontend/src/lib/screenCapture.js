async function returnFocusToOriginWindow(originWindow) {
  if (!originWindow || typeof originWindow.focus !== "function") {
    return;
  }

  // getDisplayMedia can leave the chosen source tab/window in front.
  // Re-focus the originating Tilt Guard tab only after a successful selection.
  originWindow.focus();

  await new Promise((resolve) => {
    originWindow.setTimeout(resolve, 0);
  });

  originWindow.focus();
}

export async function captureDisplayFrame(sessionId) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const error = new Error("Screen capture is not available in this browser.");
    error.code = "UNAVAILABLE";
    throw error;
  }

  const originWindow = typeof window !== "undefined" ? window : null;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: 1,
    },
    audio: false,
  });

  const video = document.createElement("video");

  try {
    await returnFocusToOriginWindow(originWindow);

    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }

      video.onloadedmetadata = () => resolve();
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((capturedBlob) => {
        if (capturedBlob) {
          resolve(capturedBlob);
          return;
        }

        reject(new Error("Could not capture a frame from the selected source."));
      }, "image/png");
    });

    return new File([blob], `session-${sessionId}-${Date.now()}.png`, {
      type: "image/png",
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}
