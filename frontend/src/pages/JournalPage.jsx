import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { EndSessionPanel } from "../components/EndSessionPanel";
import { JournalConsole } from "../components/JournalConsole";
import { LoadingView } from "../components/LoadingView";
import { ScreenshotGallery } from "../components/ScreenshotGallery";
import { useAuth } from "../context/AuthContext";
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

export function JournalPage() {
  const navigate = useNavigate();
  const commandInputRef = useRef(null);
  const filePickerRef = useRef(null);
  const logRef = useRef(null);
  const { sessionId } = useParams();
  const { token } = useAuth();
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

  const feed = useMemo(
    () => buildFeed(journalEntries, tradeEvents, screenshots),
    [journalEntries, screenshots, tradeEvents],
  );
  const hasPostScreenshot = screenshots.some((shot) => shot.screenshot_type === "post");
  const activePrompt = workflow
    ? GUIDED_WORKFLOWS[workflow.type][workflow.stepIndex]
    : null;

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
    setWorkflow(null);
    setCommandInput("");
  }

  async function loadPage() {
    setIsLoading(true);
    setPageError("");

    try {
      const [sessionResponse, journalResponse, tradeResponse, positionResponse, screenshotResponse] =
        await Promise.all([
          fetchSessionDetail(token, sessionId),
          fetchJournalEntries(token, sessionId),
          fetchTradeEvents(token, sessionId),
          fetchPosition(token, sessionId),
          fetchScreenshots(token, sessionId),
        ]);

      setSession(sessionResponse);
      setJournalEntries(journalResponse);
      setTradeEvents(tradeResponse);
      setPosition(positionResponse);
      setScreenshots(screenshotResponse);
      setPanelMode(sessionResponse.status === "closed" ? "details" : null);
    } catch (loadError) {
      setPageError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [sessionId, token]);

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

  function startCloseWorkflow() {
    if (position.current_open_size <= 0) {
      cancelWorkflow();
      setActionError("There is no open position available to close.");
      focusConsoleInput();
      return;
    }

    startWorkflow("close");
  }

  async function runSlashCommand(commandText) {
    const normalized = commandText.trim().toLowerCase();

    switch (normalized) {
      case "/open":
        startWorkflow("open");
        return;
      case "/close":
        startCloseWorkflow();
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
      throw new Error(`${step.label} is required.`);
    }

    const parsedValue = rawValue ? step.parse(rawValue) : "";
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

        const tradeEvent =
          workflow.type === "open"
            ? await openTrade(token, sessionId, payload)
            : await closeTrade(token, sessionId, payload);

        setTradeEvents((current) => [...current, tradeEvent]);
        setPosition(await fetchPosition(token, sessionId));
      }

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
    setActionError("");

    if (session?.status !== "open" && !workflow) {
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
      if (workflow?.type === "close") {
        cancelWorkflow();
      }
      setActionError(submissionError.message);
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

    setIsSubmitting(true);
    setActionError("");

    try {
      await uploadJournalScreenshot(file);
    } catch (uploadError) {
      setActionError(uploadError.message);
    } finally {
      setIsSubmitting(false);
      event.target.value = "";
      focusConsoleInput();
    }
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
    } finally {
      setIsSubmitting(false);
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
    <div className="workspace-page">
      <input
        ref={filePickerRef}
        accept="image/*"
        hidden
        onChange={handleManualScreenshot}
        type="file"
      />

      <section className="journal-top-strip glass-panel">
        <div className="session-line">
          <strong>#{session.id}</strong>
          <span>{session.symbol}</span>
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
            disabled={session.status !== "open" || isSubmitting}
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

      {pageError ? <div className="alert error-alert">{pageError}</div> : null}
      {actionError ? <div className="alert error-alert">{actionError}</div> : null}

      <section className={`journal-workbench ${panelMode ? "with-side-panel" : ""}`}>
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

        {panelMode === "details" ? (
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
                <dd>{session.symbol}</dd>
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

        {panelMode === "screens" ? (
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

        {panelMode === "end" ? (
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
    </div>
  );
}
