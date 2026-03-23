/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { captureDisplayFrame } from "./screenCapture";

function createMockTrack() {
  return {
    stop: vi.fn(),
  };
}

function installCaptureDomMocks() {
  const originalCreateElement = document.createElement.bind(document);
  const mockTrack = createMockTrack();
  const mockStream = {
    getTracks: () => [mockTrack],
  };

  const mockVideo = {
    muted: false,
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 720,
    onloadedmetadata: null,
    play: vi.fn().mockResolvedValue(undefined),
    srcObject: null,
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    }),
    toBlob: vi.fn((callback) => {
      callback(new Blob(["image"], { type: "image/png" }));
    }),
  };

  vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
    if (tagName === "video") {
      return mockVideo;
    }

    if (tagName === "canvas") {
      return mockCanvas;
    }

    return originalCreateElement(tagName, options);
  });

  return {
    mockCanvas,
    mockStream,
    mockTrack,
    mockVideo,
  };
}

describe("captureDisplayFrame", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns focus to the originating tab after a successful source selection", async () => {
    const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});
    const getDisplayMedia = vi.fn();
    const { mockStream, mockTrack, mockVideo } = installCaptureDomMocks();
    getDisplayMedia.mockResolvedValue(mockStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia,
      },
    });

    const file = await captureDisplayFrame("journal");

    expect(file).toBeInstanceOf(File);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(mockVideo.play).toHaveBeenCalledTimes(1);
    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("does not try to refocus the app when the picker is cancelled", async () => {
    const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});
    const pickerError = new DOMException("The request is not allowed", "NotAllowedError");
    const getDisplayMedia = vi.fn().mockRejectedValue(pickerError);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia,
      },
    });

    await expect(captureDisplayFrame("journal")).rejects.toThrow("The request is not allowed");
    expect(focusSpy).not.toHaveBeenCalled();
  });
});
