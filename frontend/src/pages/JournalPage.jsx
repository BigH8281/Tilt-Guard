import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { EndSessionPanel } from "../components/EndSessionPanel";
import { JournalConsole } from "../components/JournalConsole";
import { LiveTradingStatus } from "../components/LiveTradingStatus";
import { LoadingView } from "../components/LoadingView";
import { ScreenshotGallery } from "../components/ScreenshotGallery";
import { SystemActivityFeed } from "../components/SystemActivityFeed";
import { useAuth } from "../context/AuthContext";
import {
  getLiveAccountName,
  getLiveBrokerLabel,
  getLiveSymbol,
  getUnifiedMonitoringStatusCopy,
  useBrokerSystemFeed,
  useExtensionSessionStatus,
  useLatestBrokerTelemetry,
} from "../lib/brokerTelemetry";
import {
  closeTrade,
  createJournalEntry,
  endSession,
  fetchJournalEntries,
  fetchPosition,
  fetchScreenshots,
  fetchSessionDetail,
  fetchTradeEvents,
  openTrade,
  updateSessionSetup,
  uploadScreenshot,
} from "../lib/api";
import { formatDateTime } from "../lib/format";
import {
  clearPreSessionScreenshotState,
  getPreSessionScreenshotFile,
  getPreSessionScreenshotState,
  markPreSessionScreenshotFailed,
  markPreSessionScreenshotSucceeded,
  markPreSessionScreenshotUploading,
  queuePreSessionScreenshot,
} from "../lib/preSessionScreenshot";
import { captureDisplayFrame } from "../lib/screenCapture";

const GUIDED_WORKFLOWS = {
  setup: [
    {
      key: "market_bias",
      label: "Bias",
      placeholder: "bullish, bearish, neutral",
      parse(value) {
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error("Bias is required.");
        }
        return trimmed;
      },
    },
    {
      key: "htf_condition",
      label: "HTF condition",
      placeholder: "trend day, range day, inside day",
      parse(value) {
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error("HTF condition is required.");
        }
        return trimmed;
      },
    },
    {
      key: "expected_open_type",
      label: "Expected open type",
      placeholder: "continuation, reversal, breakout",
      parse(value) {
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error("Expected open type is required.");
        }
        return trimmed;
      },
    },
    {
      key: "confidence",
      label: "Confidence",
      placeholder: "1 to 10",
      parse(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
          throw new Error("Confidence must be a whole number between 1 and 10.");
        }
        return parsed;
      },
    },
  ],
  open: [
    {
      key: "direction",
      label: "Direction",
      placeholder: "long or short",
      parse(value) {
        const normalized = value.trim().toLowerCase();
        if (!["long", "short"].includes(normalized)) {
          throw new Error("Direction must be long or short.");
        }
        return normalized;
      },
    },
    {
      key: "size",
      label: "Size",
      placeholder: "contracts",
      parse(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("Size must be a whole number greater than zero.");
        }
        return parsed;
      },
    },
    {
      key: "note",
      label: "Optional note",
      placeholder: "optional context, or press Enter to skip",
      optional: true,
      parse(value) {
        return value.trim();
      },
    },
  ],
  close: [
    {
      key: "size",
      label: "Size closed",
      placeholder: "contracts",
      parse(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error("Size closed must be a whole number greater than zero.");
        }
        return parsed;
      },
    },
    {
      key: "result_gbp",
      label: "Result GBP",
      placeholder: "e.g. 125.50 or -80",
      parse(value) {
        const parsed = Number.parseFloat(value);
        if (Number.isNaN(parsed)) {
          throw new Error("Result must be a valid GBP amount.");
        }
        return parsed;
      },
    },
    {
      key: "note",
      label: "Optional note",
      placeholder: "optional context, or press Enter to skip",
      optional: true,
      parse(value) {
        return value.trim();
      },
    },
  ],
};

const JOURNAL_VIEW_MODE_STORAGE_KEY = "tilt-guard-journal-view-mode";

function buildFeed(journalEntries, tradeEvents, screenshots) {
  const journalFeed = journalEntries.map((entry) => ({
    id: `journal-${entry.id}`,
    type: "journal",
    timestamp: entry.created_at,
    payload: entry,
  }));
  const tradeFeed = tradeEvents.map((event) => ({
    id: `trade-${event.id}`,
    type: "trade",
    timestamp: event.event_time,
    payload: event,
  }));
  const screenshotFeed = screenshots.map((screenshot) => ({
    id: `screenshot-${screenshot.id}`,
    type: "screenshot",
    timestamp: screenshot.uploaded_at,
    payload: screenshot,
  }));

  return [...journalFeed, ...tradeFeed, ...screenshotFeed].sort(
    (left, right) => new Date(left.timestamp) - new Date(right.timestamp),
  );
}

function isOpeningSetupPending(session) {
  return (
    session.market_bias === "pending" ||
    session.htf_condition === "pending" ||
    session.expected_open_type === "pending" ||
    session.confidence === 0
  );
}

function displaySessionField(value) {
  return value === "pending" ? "Setup pending" : value;
}

function getStoredJournalViewMode() {
  if (typeof window === "undefined") {
    return "full";
  }

  const stored = window.localStorage.getItem(JOURNAL_VIEW_MODE_STORAGE_KEY);
  return stored === "minimized" ? "minimized" : "full";
}

function createWorkflowValidationError(message) {
  const error = new Error(message);
  error.code = "WORKFLOW_VALIDATION";
  return error;
}

function formatSessionRefreshError(failures) {
  if (!failures.length) {
    return "";
  }

  if (failures.length === 1) {
    return `Some session data could not be refreshed: ${failures[0]}.`;
  }

  return `Some session data could not be refreshed: ${failures.join(", ")}.`;
}

export function JournalPage() {
  const navigate = useNavigate();
  const commandInputRef = useRef(null);
  const filePickerRef = useRef(null);
  const filePickerModeRef = useRef("journal");
  const logRef = useRef(null);
  const { sessionId } = useParams();
  const { token } = useAuth();
  const liveTelemetry = useLatestBrokerTelemetry(token);
  const extensionSession = useExtensionSessionStatus(token);
  const brokerSystemFeed = useBrokerSystemFeed(token, 16);
  const [session, setSession] = useState(null);
  const [journalEntries, setJournalEntries] = useState([]);
  const [tradeEvents, setTradeEvents] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [position, setPosition] = useState({ current_open_size: 0 });
  const [commandInput, setCommandInput] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [panelMode, setPanelMode] = useState(null);
  const [systemLines, setSystemLines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [viewMode, setViewMode] = useState(getStoredJournalViewMode);
  const [preSessionScreenshotUpload, setPreSessionScreenshotUpload] = useState(null);
  const [isPreSessionScreenshotUploading, setIsPreSessionScreenshotUploading] = useState(false);

  const feed = useMemo(
    () => buildFeed(journalEntries, tradeEvents, screenshots),
    [journalEntries, screenshots, tradeEvents],
  );
  const hasPostScreenshot = screenshots.some((shot) => shot.screenshot_type === "post");
  const hasPreScreenshot = screenshots.some((shot) => shot.screenshot_type === "pre");
  const isMinimizedMode = viewMode === "minimized";
  const activePrompt = workflow
    ? GUIDED_WORKFLOWS[workflow.type][workflow.stepIndex]
    : null;
  const unifiedMonitoringStatus = getUnifiedMonitoringStatusCopy(
    extensionSession.session,
    liveTelemetry.telemetry,
  );
  const liveSymbol = getLiveSymbol(extensionSession.session, liveTelemetry.telemetry, session?.symbol);
  const ribbonBroker = getLiveBrokerLabel(extensionSession.session, liveTelemetry.telemetry, "Unavailable");
  const ribbonAccount = getLiveAccountName(extensionSession.session, liveTelemetry.telemetry, "Unavailable");
  const ribbonSymbol = liveSymbol || "Unavailable";
  const ribbonModeLabel = activePrompt
    ? `${workflow.type.toUpperCase()} • ${activePrompt.label}`
    : "LIVE NOTE";

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(JOURNAL_VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    setPreSessionScreenshotUpload(getPreSessionScreenshotState(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    document.body.classList.toggle("journal-shell-minimized", isMinimizedMode);

    return () => {
      document.body.classList.remove("journal-shell-minimized");
    };
  }, [isMinimizedMode]);

  function logClientEvent(level, event, details = {}) {
    const payload = {
      event,
      sessionId,
      sessionStatus: session?.status ?? null,
      currentOpenSize: position.current_open_size,
      workflowType: workflow?.type ?? null,
      workflowStepIndex: workflow?.stepIndex ?? null,
      panelMode,
      isSubmitting,
      ...details,
    };
    const logger = console[level] ?? console.info;
    logger("[JournalPage]", payload);
  }

  function syncPreSessionScreenshotState() {
    setPreSessionScreenshotUpload(getPreSessionScreenshotState(sessionId));
  }

  function focusConsoleInput() {
    window.requestAnimationFrame(() => {
      if (!commandInputRef.current?.disabled) {
        commandInputRef.current?.focus();
      }
    });
  }

  function addSystemLines(lines) {
    const timestamp = new Date().toISOString();
    setSystemLines((current) => [
      ...current,
      ...lines.map((text, index) => ({
        id: `system-${Date.now()}-${index}`,
        kind: "system",
        timestamp,
        text,
      })),
    ]);
  }

  function cancelWorkflow() {
    logClientEvent("info", "guided_action_cancelled");
    setWorkflow(null);
    setCommandInput("");
  }

  async function syncSessionState(reason, options = {}) {
    const { showSpinner = false } = options;
    logClientEvent("info", "session_state_sync_started", { reason, showSpinner });

    if (showSpinner) {
      setIsLoading(true);
    }
    setPageError("");

    try {
      const sessionResponse = await fetchSessionDetail(token, sessionId);
      setSession(sessionResponse);
      setPanelMode(sessionResponse.status === "closed" ? "details" : null);

      const results = await Promise.allSettled([
        fetchJournalEntries(token, sessionId),
        fetchTradeEvents(token, sessionId),
        fetchPosition(token, sessionId),
        fetchScreenshots(token, sessionId),
      ]);
      const [journalResult, tradeResult, positionResult, screenshotResult] = results;
      const failures = [];

      if (journalResult.status === "fulfilled") {
        setJournalEntries(journalResult.value);
      } else {
        failures.push("journal entries");
        logClientEvent("warn", "session_journal_fetch_failed", {
          reason,
          error: journalResult.reason?.message ?? String(journalResult.reason),
          status: journalResult.reason?.status ?? null,
        });
      }

      if (tradeResult.status === "fulfilled") {
        setTradeEvents(tradeResult.value);
      } else {
        failures.push("trade events");
        logClientEvent("warn", "session_trade_fetch_failed", {
          reason,
          error: tradeResult.reason?.message ?? String(tradeResult.reason),
          status: tradeResult.reason?.status ?? null,
        });
      }

      if (positionResult.status === "fulfilled") {
        setPosition(positionResult.value);
      } else {
        failures.push("position");
        logClientEvent("warn", "session_position_fetch_failed", {
          reason,
          error: positionResult.reason?.message ?? String(positionResult.reason),
          status: positionResult.reason?.status ?? null,
        });
      }

      if (screenshotResult.status === "fulfilled") {
        setScreenshots(screenshotResult.value);
      } else {
        failures.push("screenshots");
        logClientEvent("warn", "session_screenshot_fetch_failed", {
          reason,
          error: screenshotResult.reason?.message ?? String(screenshotResult.reason),
          status: screenshotResult.reason?.status ?? null,
        });
      }

      const refreshError = formatSessionRefreshError(failures);
      if (refreshError) {
        setPageError(refreshError);
      }

      if (screenshotResult.status === "fulfilled") {
        const hasPre = screenshotResult.value.some((shot) => shot.screenshot_type === "pre");
        if (hasPre) {
          if (getPreSessionScreenshotState(sessionId)) {
            markPreSessionScreenshotSucceeded(sessionId);
            syncPreSessionScreenshotState();
          }
          setIsPreSessionScreenshotUploading(false);
        } else {
          syncPreSessionScreenshotState();
        }
      }

      logClientEvent("info", "session_state_sync_completed", {
        reason,
        syncedSessionStatus: sessionResponse.status,
        syncedOpenSize:
          positionResult.status === "fulfilled" ? positionResult.value.current_open_size : null,
        syncedTradeCount: tradeResult.status === "fulfilled" ? tradeResult.value.length : null,
        syncedJournalCount: journalResult.status === "fulfilled" ? journalResult.value.length : null,
        syncedScreenshotCount:
          screenshotResult.status === "fulfilled" ? screenshotResult.value.length : null,
        partialFailureCount: failures.length,
      });

      return {
        sessionResponse,
        journalResponse: journalResult.status === "fulfilled" ? journalResult.value : null,
        tradeResponse: tradeResult.status === "fulfilled" ? tradeResult.value : null,
        positionResponse: positionResult.status === "fulfilled" ? positionResult.value : null,
        screenshotResponse: screenshotResult.status === "fulfilled" ? screenshotResult.value : null,
      };
    } catch (loadError) {
      logClientEvent("warn", "session_state_sync_failed", {
        reason,
        error: loadError.message,
      });
      if (showSpinner) {
        setPageError(loadError.message);
      }
      throw loadError;
    } finally {
      if (showSpinner) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    syncSessionState("page-load", { showSpinner: true }).catch(() => {});
  }, [sessionId, token]);

  useEffect(() => {
    if (!session || session.status !== "open" || hasPreScreenshot) {
      if (hasPreScreenshot) {
        if (getPreSessionScreenshotState(sessionId)) {
          markPreSessionScreenshotSucceeded(sessionId);
          syncPreSessionScreenshotState();
        }
        setIsPreSessionScreenshotUploading(false);
      }
      return;
    }

    const pendingUpload = getPreSessionScreenshotState(sessionId);
    const queuedFile = getPreSessionScreenshotFile(sessionId);
    setPreSessionScreenshotUpload(pendingUpload);

    if (pendingUpload?.status === "queued" && queuedFile && !isPreSessionScreenshotUploading) {
      void uploadPreSessionScreenshot(queuedFile, {
        reason: "auto-start",
      });
    } else if (pendingUpload?.status === "queued" && !queuedFile) {
      markPreSessionScreenshotFailed(
        sessionId,
        "Opening screenshot upload was interrupted. Select the screenshot again to retry.",
      );
      syncPreSessionScreenshotState();
    }
  }, [hasPreScreenshot, isPreSessionScreenshotUploading, session, sessionId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [feed, systemLines, workflow]);

  useEffect(() => {
    if (!isLoading && session?.status === "open") {
      focusConsoleInput();
    }
  }, [isLoading, session?.id, session?.status]);

  useEffect(() => {
    if (
      !isLoading &&
      session?.status === "open" &&
      isOpeningSetupPending(session) &&
      !workflow
    ) {
      startWorkflow("setup");
    }
  }, [isLoading, session, workflow]);

  function startWorkflow(type) {
    setActionError("");
    setPanelMode(null);
    logClientEvent("info", "guided_action_started", { type });
    setWorkflow({
      type,
      stepIndex: 0,
      values: {},
      transcript: [
        {
          id: `start-${Date.now()}`,
          kind: "system",
          timestamp: new Date().toISOString(),
          text:
            type === "setup"
              ? "Opening session setup started"
              : `Trade ${type} entry started`,
        },
      ],
    });
    setCommandInput("");
    focusConsoleInput();
  }

  async function getFreshPosition(reason) {
    const latestPosition = await fetchPosition(token, sessionId);
    setPosition(latestPosition);
    logClientEvent("info", "position_refreshed", {
      reason,
      refreshedOpenSize: latestPosition.current_open_size,
    });
    return latestPosition;
  }

  async function recoverFromActionError(reason, error, options = {}) {
    const { resetWorkflow = Boolean(workflow) } = options;
    logClientEvent("warn", "action_error_recovery_started", {
      reason,
      error: error.message,
      resetWorkflow,
    });

    if (resetWorkflow) {
      cancelWorkflow();
    }

    try {
      await syncSessionState(`recovery:${reason}`);
    } catch (refreshError) {
      logClientEvent("warn", "action_error_recovery_sync_failed", {
        reason,
        refreshError: refreshError.message,
      });
    }

    focusConsoleInput();
  }

  async function ensureCloseFlowAllowed(source) {
    const latestPosition = await getFreshPosition(`close-check:${source}`);
    if (latestPosition.current_open_size > 0) {
      return latestPosition;
    }

    const message = "There is no open position available to close.";
    setActionError(message);
    logClientEvent("warn", "guided_action_close_blocked", {
      source,
      refreshedOpenSize: latestPosition.current_open_size,
    });
    cancelWorkflow();
    return null;
  }

  async function startCloseWorkflow(source = "toolbar") {
    if (session?.status !== "open") {
      return;
    }

    setActionError("");
    setIsSubmitting(true);
    logClientEvent("info", "guided_action_close_requested", { source });

    try {
      const latestPosition = await ensureCloseFlowAllowed(source);
      if (!latestPosition) {
        return;
      }

      startWorkflow("close");
    } catch (error) {
      setActionError(error.message);
      await recoverFromActionError(`close-start:${source}`, error, {
        resetWorkflow: false,
      });
    } finally {
      setIsSubmitting(false);
      focusConsoleInput();
    }
  }

  async function runSlashCommand(commandText) {
    const normalized = commandText.trim().toLowerCase();

    switch (normalized) {
      case "/open":
        startWorkflow("open");
        return;
      case "/close":
        await startCloseWorkflow("slash-command");
        return;
      case "/end":
        setWorkflow(null);
        setPanelMode("end");
        focusConsoleInput();
        return;
      case "/screenshot":
        await handleCaptureScreenshot();
        return;
      case "/help":
        addSystemLines([
          "Available commands: /open /close /end /screenshot /help",
        ]);
        focusConsoleInput();
        return;
      default:
        addSystemLines([
          `Unknown command: ${normalized}`,
          "Available commands: /open /close /end /screenshot /help",
        ]);
        focusConsoleInput();
    }
  }

  async function submitGuidedWorkflow(answerText) {
    const step = GUIDED_WORKFLOWS[workflow.type][workflow.stepIndex];
    const rawValue = answerText.trim();

    if (!rawValue && !step.optional) {
      throw createWorkflowValidationError(`${step.label} is required.`);
    }

    let parsedValue = "";
    try {
      parsedValue = rawValue ? step.parse(rawValue) : "";
    } catch (error) {
      throw createWorkflowValidationError(error.message);
    }

    const nextValues = {
      ...workflow.values,
      [step.key]: parsedValue,
    };
    const nextTranscript = [
      ...workflow.transcript,
      {
        id: `${step.key}-${Date.now()}`,
        kind: "system",
        timestamp: new Date().toISOString(),
        text: `${step.label}: ${rawValue || "(skipped)"}`,
      },
    ];

    if (workflow.stepIndex === GUIDED_WORKFLOWS[workflow.type].length - 1) {
      if (workflow.type === "setup") {
        const updatedSession = await updateSessionSetup(token, sessionId, nextValues);
        const createdEntries = [];

        for (const content of [
          `[SETUP][BIAS] ${nextValues.market_bias}`,
          `[SETUP][HTF] ${nextValues.htf_condition}`,
          `[SETUP][OPEN TYPE] ${nextValues.expected_open_type}`,
          `[SETUP][CONFIDENCE] ${nextValues.confidence}/10`,
        ]) {
          createdEntries.push(await createJournalEntry(token, sessionId, content));
        }

        setSession(updatedSession);
        setJournalEntries((current) => [...current, ...createdEntries]);
      } else {
        const payload =
          workflow.type === "open"
            ? {
                direction: nextValues.direction,
                size: nextValues.size,
                note: nextValues.note || undefined,
              }
            : {
                size: nextValues.size,
                result_gbp: nextValues.result_gbp,
                note: nextValues.note || undefined,
              };

        if (workflow.type === "close") {
          const latestPosition = await ensureCloseFlowAllowed("guided-submit");
          if (!latestPosition) {
            return;
          }

          if (nextValues.size > latestPosition.current_open_size) {
            throw new Error("Cannot close more than the current open size.");
          }
        }

        const tradeEvent =
          workflow.type === "open"
            ? await openTrade(token, sessionId, payload)
            : await closeTrade(token, sessionId, payload);

        setTradeEvents((current) => [...current, tradeEvent]);
        setPosition(await getFreshPosition(`${workflow.type}-submit-success`));
      }

      logClientEvent("info", "guided_action_completed", {
        type: workflow.type,
      });
      setWorkflow(null);
      setCommandInput("");
      focusConsoleInput();
      return;
    }

    setWorkflow({
      ...workflow,
      stepIndex: workflow.stepIndex + 1,
      values: nextValues,
      transcript: nextTranscript,
    });
    setCommandInput("");
    focusConsoleInput();
  }

  async function handleCommandSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      logClientEvent("info", "composer_submit_ignored", {
        reason: "already-submitting",
      });
      return;
    }

    setActionError("");
    logClientEvent("info", "composer_submit_received", {
      hasWorkflow: Boolean(workflow),
      inputLength: commandInput.length,
      startsWithSlash: commandInput.trim().startsWith("/"),
    });

    if (session?.status !== "open" && !workflow) {
      logClientEvent("info", "composer_submit_ignored", {
        reason: "session-not-open",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (workflow) {
        await submitGuidedWorkflow(commandInput);
      } else {
        const note = commandInput.trim();
        if (!note) {
          return;
        }

        if (note.startsWith("/")) {
          setCommandInput("");
          await runSlashCommand(note);
          return;
        }

        const entry = await createJournalEntry(token, sessionId, note);
        setJournalEntries((current) => [...current, entry]);
        setCommandInput("");
      }
    } catch (submissionError) {
      logClientEvent("warn", "composer_submit_failed", {
        error: submissionError.message,
        errorCode: submissionError.code ?? null,
      });
      setActionError(submissionError.message);
      if (submissionError.code !== "WORKFLOW_VALIDATION") {
        await recoverFromActionError("composer-submit", submissionError);
      }
    } finally {
      setIsSubmitting(false);
      if (session?.status === "open" || panelMode === "end") {
        focusConsoleInput();
      }
    }
  }

  async function uploadJournalScreenshot(file) {
    const screenshot = await uploadScreenshot(token, sessionId, "journal", file);
    setScreenshots((current) => [...current, screenshot]);
  }

  async function uploadPreSessionScreenshot(file, { reason }) {
    if (!session || session.status !== "open") {
      return;
    }

    setIsPreSessionScreenshotUploading(true);
    markPreSessionScreenshotUploading(sessionId);
    syncPreSessionScreenshotState();
    logClientEvent("info", "pre_session_screenshot_upload_started", {
      reason,
      fileName: file.name,
    });

    try {
      const screenshot = await uploadScreenshot(token, sessionId, "pre", file);
      setScreenshots((current) => [...current, screenshot]);
      markPreSessionScreenshotSucceeded(sessionId);
      syncPreSessionScreenshotState();
      logClientEvent("info", "pre_session_screenshot_upload_succeeded", {
        reason,
        screenshotId: screenshot.id,
      });
    } catch (uploadError) {
      markPreSessionScreenshotFailed(sessionId, uploadError.message);
      syncPreSessionScreenshotState();
      logClientEvent("warn", "pre_session_screenshot_upload_failed", {
        reason,
        error: uploadError.message,
        status: uploadError.status ?? null,
      });
    } finally {
      setIsPreSessionScreenshotUploading(false);
    }
  }

  async function handleCaptureScreenshot() {
    if (session.status !== "open") {
      return;
    }

    setIsSubmitting(true);
    setActionError("");

    try {
      const file = await captureDisplayFrame(sessionId);
      await uploadJournalScreenshot(file);
    } catch (captureError) {
      if (
        captureError.code === "UNAVAILABLE" ||
        captureError.name === "NotAllowedError" ||
        captureError.name === "AbortError" ||
        captureError.name === "NotFoundError"
      ) {
        filePickerRef.current?.click();
        setActionError(
          "Screen capture was unavailable or denied. Select a file manually instead.",
        );
      } else {
        setActionError(captureError.message);
        await recoverFromActionError("journal-screenshot-upload", captureError, {
          resetWorkflow: false,
        });
      }
    } finally {
      setIsSubmitting(false);
      focusConsoleInput();
    }
  }

  async function handleManualScreenshot(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (filePickerModeRef.current === "pre") {
        await uploadPreSessionScreenshot(file, { reason: "manual-retry" });
      } else {
        setIsSubmitting(true);
        setActionError("");
        await uploadJournalScreenshot(file);
      }
    } catch (uploadError) {
      if (filePickerModeRef.current === "pre") {
        markPreSessionScreenshotFailed(sessionId, uploadError.message);
        syncPreSessionScreenshotState();
      } else {
        setActionError(uploadError.message);
        await recoverFromActionError("manual-journal-screenshot-upload", uploadError, {
          resetWorkflow: false,
        });
      }
    } finally {
      setIsSubmitting(false);
      event.target.value = "";
      filePickerModeRef.current = "journal";
      focusConsoleInput();
    }
  }

  async function handleCapturePreSessionScreenshot() {
    try {
      const file = await captureDisplayFrame(`${sessionId}-pre-retry`);
      queuePreSessionScreenshot(sessionId, file);
      syncPreSessionScreenshotState();
      await uploadPreSessionScreenshot(file, { reason: "capture-retry" });
    } catch (captureError) {
      if (
        captureError.code === "UNAVAILABLE" ||
        captureError.name === "NotAllowedError" ||
        captureError.name === "AbortError" ||
        captureError.name === "NotFoundError"
      ) {
        filePickerModeRef.current = "pre";
        filePickerRef.current?.click();
        markPreSessionScreenshotFailed(
          sessionId,
          "Screen capture was unavailable or denied. Choose a file to retry the opening screenshot.",
        );
        syncPreSessionScreenshotState();
      } else {
        markPreSessionScreenshotFailed(sessionId, captureError.message);
        syncPreSessionScreenshotState();
      }
    }
  }

  async function handleRetryQueuedPreSessionScreenshot() {
    const file = getPreSessionScreenshotFile(sessionId);
    if (!file) {
      markPreSessionScreenshotFailed(
        sessionId,
        "The original screenshot is no longer available in this tab. Capture or upload it again to retry.",
      );
      syncPreSessionScreenshotState();
      return;
    }

    await uploadPreSessionScreenshot(file, { reason: "queued-retry" });
  }

  async function handleEndSession(payload, postScreenshot) {
    setIsSubmitting(true);
    setActionError("");

    try {
      if (postScreenshot) {
        const screenshot = await uploadScreenshot(token, sessionId, "post", postScreenshot);
        setScreenshots((current) => [...current, screenshot]);
      }

      if (!hasPostScreenshot && !postScreenshot) {
        throw new Error("Upload a post-session screenshot before closing.");
      }

      await endSession(token, sessionId, payload);
      navigate("/");
    } catch (submissionError) {
      setActionError(submissionError.message);
      if (submissionError.message !== "Upload a post-session screenshot before closing.") {
        await recoverFromActionError("end-session", submissionError, {
          resetWorkflow: false,
        });
      }
    } finally {
      setIsSubmitting(false);
      focusConsoleInput();
    }
  }

  if (isLoading) {
    return <LoadingView label="Loading session..." />;
  }

  if (!session) {
    return (
      <EmptyState
        title="Session unavailable"
        description={pageError || "The session could not be loaded."}
        action={
          <Link to="/">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className={`workspace-page ${isMinimizedMode ? "journal-minimized-mode" : ""}`}>
      <input
        ref={filePickerRef}
        accept="image/*"
        hidden
        onChange={handleManualScreenshot}
        type="file"
      />

      {isMinimizedMode ? (
        <section className="journal-minimized-ribbon">
          <div className="journal-ribbon-strip">
            <span className={`journal-ribbon-dot ${unifiedMonitoringStatus.tone}`} />
            <span className="journal-ribbon-pill">{unifiedMonitoringStatus.label}</span>
            <span className="journal-ribbon-meta">Broker {ribbonBroker}</span>
            <span className="journal-ribbon-meta">Acct {ribbonAccount}</span>
            <span className="journal-ribbon-meta">Sym {ribbonSymbol}</span>
            <span className={`journal-ribbon-pill ${session.status}`}>{session.status}</span>
            <span className="journal-ribbon-meta">Mode {ribbonModeLabel}</span>
            <span className="journal-ribbon-meta">{position.current_open_size} open</span>
          </div>
          <div className="journal-ribbon-actions">
            {session.status === "open" ? (
              <button
                className="journal-ribbon-button journal-ribbon-button-danger"
                onClick={() => setPanelMode(panelMode === "end" ? null : "end")}
                type="button"
              >
                End
              </button>
            ) : null}
            <button
              className="journal-ribbon-button"
              onClick={() => setViewMode("full")}
              type="button"
            >
              Full
            </button>
          </div>
        </section>
      ) : (
        <>
          <LiveTradingStatus
            error={extensionSession.error || liveTelemetry.error}
            extensionSession={extensionSession.session}
            isLoading={liveTelemetry.isLoading || extensionSession.isLoading}
            isRefreshing={liveTelemetry.isRefreshing || extensionSession.isRefreshing}
            onRefresh={async () => {
              await Promise.all([liveTelemetry.refresh(), extensionSession.refresh()]);
            }}
            telemetry={liveTelemetry.telemetry}
            title="Live Context"
            variant="strip"
          />

          <section className="journal-top-strip glass-panel">
            <div className="session-line">
              <strong>#{session.id}</strong>
              <span>{liveSymbol || session.symbol}</span>
              <span>{session.session_name}</span>
              <span>{displaySessionField(session.market_bias)}</span>
              <span>{displaySessionField(session.htf_condition)}</span>
              <span>{displaySessionField(session.expected_open_type)}</span>
              <span>{session.confidence > 0 ? `${session.confidence}/10` : "Confidence pending"}</span>
              <span>{position.current_open_size} open</span>
              <span className={`status-pill ${session.status}`}>{session.status}</span>
            </div>
            <div className="toolbar-row">
              <Link to="/">
                <Button type="button" variant="secondary">
                  Dashboard
                </Button>
              </Link>
              <Button
                disabled={session.status !== "open" || isSubmitting}
                onClick={() => startWorkflow("open")}
                type="button"
                variant="secondary"
              >
                Trade Open
              </Button>
              <Button
                disabled={session.status !== "open" || isSubmitting || position.current_open_size <= 0}
                onClick={startCloseWorkflow}
                type="button"
                variant="secondary"
              >
                Trade Close
              </Button>
              <Button
                disabled={session.status !== "open" || isSubmitting}
                onClick={handleCaptureScreenshot}
                type="button"
                variant="secondary"
              >
                Screenshot
              </Button>
              <Button
                onClick={() => setPanelMode(panelMode === "screens" ? null : "screens")}
                type="button"
                variant="secondary"
              >
                Screens
              </Button>
              <Button
                onClick={() => setPanelMode(panelMode === "details" ? null : "details")}
                type="button"
                variant="secondary"
              >
                Details
              </Button>
              <Button
                className="journal-mode-toggle"
                onClick={() => setViewMode("minimized")}
                type="button"
                variant="secondary"
              >
                Minimise
              </Button>
              {session.status === "open" ? (
                <Button
                  onClick={() => setPanelMode(panelMode === "end" ? null : "end")}
                  type="button"
                  variant="danger"
                >
                  End Session
                </Button>
              ) : null}
            </div>
          </section>

          <SystemActivityFeed events={brokerSystemFeed.events} title="TradingView activity" />
        </>
      )}

      {pageError ? <div className="alert error-alert">{pageError}</div> : null}
      {preSessionScreenshotUpload &&
      (!hasPreScreenshot || preSessionScreenshotUpload.status === "succeeded") ? (
        <div
          className={`alert ${
            preSessionScreenshotUpload.status === "failed"
              ? "warning-alert"
              : preSessionScreenshotUpload.status === "succeeded"
                ? "success-alert"
                : "warning-alert"
          }`}
        >
          {preSessionScreenshotUpload.status === "uploading" ? (
            <div className="session-upload-alert">
              <span>
                Uploading opening screenshot{preSessionScreenshotUpload.fileName ? `: ${preSessionScreenshotUpload.fileName}` : ""}.
              </span>
            </div>
          ) : null}
          {preSessionScreenshotUpload.status === "queued" ? (
            <div className="session-upload-alert">
              <span>
                Opening screenshot queued and will upload in the background after the journal opens.
              </span>
            </div>
          ) : null}
          {preSessionScreenshotUpload.status === "failed" ? (
            <div className="session-upload-alert">
              <span>
                Opening screenshot upload failed. You can continue journaling and retry now or later.
                {preSessionScreenshotUpload.error ? ` ${preSessionScreenshotUpload.error}` : ""}
              </span>
              <div className="session-upload-actions">
                <Button
                  disabled={isPreSessionScreenshotUploading}
                  onClick={handleRetryQueuedPreSessionScreenshot}
                  type="button"
                  variant="secondary"
                >
                  Retry now
                </Button>
                <Button
                  disabled={isPreSessionScreenshotUploading}
                  onClick={handleCapturePreSessionScreenshot}
                  type="button"
                  variant="secondary"
                >
                  Capture opening screenshot
                </Button>
                <Button
                  disabled={isPreSessionScreenshotUploading}
                  onClick={() => {
                    filePickerModeRef.current = "pre";
                    filePickerRef.current?.click();
                  }}
                  type="button"
                  variant="secondary"
                >
                  Upload file
                </Button>
              </div>
            </div>
          ) : null}
          {preSessionScreenshotUpload.status === "succeeded" ? (
            <div className="session-upload-alert">
              <span>Opening screenshot uploaded successfully.</span>
              <div className="session-upload-actions">
                <Button
                  onClick={() => {
                    clearPreSessionScreenshotState(sessionId);
                    setPreSessionScreenshotUpload(null);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {actionError ? <div className="alert error-alert">{actionError}</div> : null}

      <section
        className={`journal-workbench ${
          panelMode && !isMinimizedMode ? "with-side-panel" : ""
        } ${isMinimizedMode ? "journal-minimized-workbench" : ""}`}
      >
        <JournalConsole
          ref={commandInputRef}
          activePrompt={activePrompt}
          feed={feed}
          inputValue={commandInput}
          isSubmitting={isSubmitting || session.status !== "open"}
          logRef={logRef}
          onInputChange={setCommandInput}
          onSubmit={handleCommandSubmit}
          systemLines={systemLines}
          workflowTranscript={workflow?.transcript ?? []}
        />

        {!isMinimizedMode && panelMode === "details" ? (
          <aside className="side-panel glass-panel review-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Session detail</p>
                <h3>{session.session_name}</h3>
              </div>
            </div>
            <dl className="dense-detail-list">
              <div>
                <dt>Symbol</dt>
                <dd>{liveSymbol || session.symbol}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatDateTime(session.started_at)}</dd>
              </div>
              <div>
                <dt>Closed</dt>
                <dd>{session.closed_at ? formatDateTime(session.closed_at) : "Open"}</dd>
              </div>
              <div>
                <dt>Bias</dt>
                <dd>{displaySessionField(session.market_bias)}</dd>
              </div>
              <div>
                <dt>HTF condition</dt>
                <dd>{displaySessionField(session.htf_condition)}</dd>
              </div>
              <div>
                <dt>Expected open</dt>
                <dd>{displaySessionField(session.expected_open_type)}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{session.confidence > 0 ? `${session.confidence}/10` : "Pending"}</dd>
              </div>
              <div>
                <dt>Traded my time</dt>
                <dd>{session.end_traded_my_time === null ? "Pending" : session.end_traded_my_time ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Traded my conditions</dt>
                <dd>{session.end_traded_my_conditions === null ? "Pending" : session.end_traded_my_conditions ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Respected exit</dt>
                <dd>{session.end_respected_my_exit === null ? "Pending" : session.end_respected_my_exit ? "Yes" : "No"}</dd>
              </div>
            </dl>
            {session.reason_time_no ? <p className="support-copy">Time: {session.reason_time_no}</p> : null}
            {session.reason_conditions_no ? <p className="support-copy">Conditions: {session.reason_conditions_no}</p> : null}
            {session.reason_exit_no ? <p className="support-copy">Exit: {session.reason_exit_no}</p> : null}
          </aside>
        ) : null}

        {!isMinimizedMode && panelMode === "screens" ? (
          <aside className="side-panel glass-panel review-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Screenshots</p>
                <h3>{screenshots.length} captured</h3>
              </div>
            </div>
            {screenshots.length ? (
              <ScreenshotGallery screenshots={screenshots} />
            ) : (
              <EmptyState
                title="No screenshots yet"
                description="Captured screenshots stay hidden here to keep the live log clean."
              />
            )}
          </aside>
        ) : null}

        {!isMinimizedMode && panelMode === "end" ? (
          <EndSessionPanel
            error={actionError}
            hasPostScreenshot={hasPostScreenshot}
            isSubmitting={isSubmitting}
            onCancel={() => setPanelMode(null)}
            onSubmit={handleEndSession}
            sessionId={sessionId}
          />
        ) : null}
      </section>

      {isMinimizedMode && panelMode === "end" ? (
        <EndSessionPanel
          error={actionError}
          hasPostScreenshot={hasPostScreenshot}
          isSubmitting={isSubmitting}
          onCancel={() => setPanelMode(null)}
          onSubmit={handleEndSession}
          sessionId={sessionId}
        />
      ) : null}
    </div>
  );
}
