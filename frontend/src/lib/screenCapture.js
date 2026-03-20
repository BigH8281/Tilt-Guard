export async function captureDisplayFrame(sessionId) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const error = new Error("Screen capture is not available in this browser.");
    error.code = "UNAVAILABLE";
    throw error;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: 1,
    },
    audio: false,
  });

  const video = document.createElement("video");

  try {
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
