import { forwardRef } from "react";

import { getAssetUrl } from "../lib/api";
import { formatCurrency, formatTime, isImageFile } from "../lib/format";

function renderPersistedLine(item) {
  if (item.type === "journal") {
    const setupMatch = item.payload.content.match(/^\[SETUP\]\[(.+?)\]\s*(.+)$/);
    if (setupMatch) {
      const setupKey = setupMatch[1].trim().toUpperCase();
      const setupValue = setupMatch[2].trim();
      const normalizedValue = setupValue.toLowerCase();

      let setupTone = "setup-meta";
      if (setupKey === "BIAS") {
        if (normalizedValue === "bullish") {
          setupTone = "setup-bullish";
        } else if (normalizedValue === "bearish") {
          setupTone = "setup-bearish";
        } else if (normalizedValue === "neutral") {
          setupTone = "setup-neutral";
        }
      }

      return {
        key: `journal-${item.payload.id}`,
        timestamp: item.payload.created_at,
        badge: setupKey === "OPEN TYPE" ? "OPEN" : setupKey,
        badgeTone: setupTone,
        lineClass: `setup-line ${setupTone}`,
        text: setupValue,
      };
    }

    return {
      key: `journal-${item.payload.id}`,
      timestamp: item.payload.created_at,
      badge: null,
      text: item.payload.content,
    };
  }

  if (item.type === "trade") {
    const parts = [
      item.payload.event_type === "OPEN" ? "[TRADE OPEN]" : "[TRADE CLOSE]",
    ];

    if (item.payload.direction) {
      parts.push(item.payload.direction);
    }

    parts.push(`${item.payload.size} contract${item.payload.size === 1 ? "" : "s"}`);

    if (item.payload.result_gbp !== null) {
      parts.push(formatCurrency(item.payload.result_gbp));
    }

    if (item.payload.note) {
      parts.push(`note: ${item.payload.note}`);
    }

    return {
      key: `trade-${item.payload.id}`,
      timestamp: item.payload.event_time,
      badge: item.payload.event_type === "OPEN" ? "OPEN" : "CLOSE",
      text: parts.join(" | "),
    };
  }

  const image = isImageFile(item.payload.file_path);

  return {
    key: `screenshot-${item.payload.id}`,
    timestamp: item.payload.uploaded_at,
    badge: "SHOT",
    text: "[SCREENSHOT CAPTURED]",
    screenshot: {
      url: getAssetUrl(item.payload.file_url),
      isImage: image,
      type: item.payload.screenshot_type,
    },
  };
}

function WorkflowLine({ line }) {
  return (
    <div className={`log-line workflow-${line.kind}`}>
      <span className="log-time">{formatTime(line.timestamp)}</span>
      <span className="log-badge system">SYS</span>
      <span className="log-text">{line.text}</span>
    </div>
  );
}

export const JournalConsole = forwardRef(function JournalConsole({
  activePrompt,
  feed,
  inputValue,
  isSubmitting,
  logRef,
  onInputChange,
  onSubmit,
  systemLines,
  workflowTranscript,
}, inputRef) {
  return (
    <section className="console-shell glass-panel">
      <header className="console-header">
        <span>Journal log</span>
        <span>{activePrompt ? `Guided mode: ${activePrompt.label}` : "Live note mode"}</span>
      </header>

      <div className="console-body" ref={logRef}>
        {feed.map((item) => {
          const line = renderPersistedLine(item);
          return (
            <div className={`log-line ${line.lineClass ?? ""}`.trim()} key={line.key}>
              <span className="log-time">{formatTime(line.timestamp)}</span>
              {line.badge ? (
                <span className={`log-badge ${line.badgeTone ?? ""}`.trim()}>{line.badge}</span>
              ) : null}
              <span className="log-text">{line.text}</span>
              {line.screenshot ? (
                line.screenshot.isImage ? (
                  <a
                    className="log-thumbnail"
                    href={line.screenshot.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <img alt={`${line.screenshot.type} screenshot`} src={line.screenshot.url} />
                  </a>
                ) : (
                  <a href={line.screenshot.url} rel="noreferrer" target="_blank">
                    file
                  </a>
                )
              ) : null}
            </div>
          );
        })}

        {workflowTranscript.map((line) => (
          <WorkflowLine key={line.id} line={line} />
        ))}

        {systemLines.map((line) => (
          <WorkflowLine key={line.id} line={line} />
        ))}

        {activePrompt ? (
          <div className="log-line prompt-line">
            <span className="log-time">{formatTime(new Date().toISOString())}</span>
            <span className="log-badge prompt">PROMPT</span>
            <span className="log-text">{activePrompt.label}</span>
          </div>
        ) : null}
      </div>

      <form className="console-input-row" onSubmit={onSubmit}>
        <span className="console-prefix">&gt;</span>
        <input
          ref={inputRef}
          autoComplete="off"
          className="console-input"
          disabled={isSubmitting}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={activePrompt ? activePrompt.placeholder : "Type a note and press Enter"}
          value={inputValue}
        />
      </form>
    </section>
  );
});
