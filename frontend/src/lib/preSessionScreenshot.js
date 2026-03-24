const STORAGE_KEY = "tilt-guard-pre-session-screenshot";
const inMemoryFiles = new Map();

function readStateMap() {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStateMap(stateMap) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateMap));
}

function updateState(sessionId, nextState) {
  const key = String(sessionId);
  const stateMap = readStateMap();

  if (nextState) {
    stateMap[key] = {
      ...nextState,
      sessionId: Number(sessionId),
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete stateMap[key];
  }

  writeStateMap(stateMap);
  return stateMap[key] ?? null;
}

export function queuePreSessionScreenshot(sessionId, file) {
  inMemoryFiles.set(String(sessionId), file);
  return updateState(sessionId, {
    status: "queued",
    fileName: file.name,
    error: "",
  });
}

export function markPreSessionScreenshotUploading(sessionId) {
  const current = getPreSessionScreenshotState(sessionId);
  return updateState(sessionId, {
    ...current,
    status: "uploading",
    error: "",
  });
}

export function markPreSessionScreenshotFailed(sessionId, error) {
  const current = getPreSessionScreenshotState(sessionId);
  return updateState(sessionId, {
    ...current,
    status: "failed",
    error,
  });
}

export function markPreSessionScreenshotSucceeded(sessionId) {
  const current = getPreSessionScreenshotState(sessionId);
  const nextState = updateState(sessionId, {
    ...current,
    status: "succeeded",
    error: "",
  });
  inMemoryFiles.delete(String(sessionId));
  return nextState;
}

export function clearPreSessionScreenshotState(sessionId) {
  inMemoryFiles.delete(String(sessionId));
  return updateState(sessionId, null);
}

export function getPreSessionScreenshotState(sessionId) {
  const stateMap = readStateMap();
  return stateMap[String(sessionId)] ?? null;
}

export function getPreSessionScreenshotFile(sessionId) {
  return inMemoryFiles.get(String(sessionId)) ?? null;
}
