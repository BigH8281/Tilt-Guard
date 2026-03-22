import { useEffect, useRef, useState } from "react";

import { Button } from "./Button";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { captureDisplayFrame } from "../lib/screenCapture";

const initialState = {
  session_name: "NY AM",
  symbol: "MNQ",
};

export function NewSessionModal({ error, isSubmitting, onClose, onSubmit, suggestedSymbol = null }) {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    ...initialState,
    symbol: suggestedSymbol || initialState.symbol,
  });
  const [screenshot, setScreenshot] = useState(null);
  const [captureHint, setCaptureHint] = useState("");
  const [hasEditedSymbol, setHasEditedSymbol] = useState(false);

  useEffect(() => {
    if (suggestedSymbol && !hasEditedSymbol) {
      setForm((current) => ({
        ...current,
        symbol: suggestedSymbol,
      }));
    }
  }, [hasEditedSymbol, suggestedSymbol]);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit(form, screenshot);
  }

  async function handleCaptureScreenshot() {
    setCaptureHint("");

    try {
      const file = await captureDisplayFrame("pre-session");
      setScreenshot(file);
    } catch (captureError) {
      if (
        captureError.code === "UNAVAILABLE" ||
        captureError.name === "NotAllowedError" ||
        captureError.name === "AbortError" ||
        captureError.name === "NotFoundError"
      ) {
        fileInputRef.current?.click();
        setCaptureHint("Screen capture unavailable or denied. Choose a file instead.");
      } else {
        setCaptureHint(captureError.message);
      }
    }
  }

  return (
    <Modal onClose={onClose} title="Start a new session">
      <form className="modal-form" onSubmit={handleSubmit}>
        <Field label="Session name">
          <input
            value={form.session_name}
            onChange={(event) => updateField("session_name", event.target.value)}
            placeholder="NY AM"
            required
          />
        </Field>
        <Field label="Symbol">
          <input
            value={form.symbol}
            onChange={(event) => {
              setHasEditedSymbol(true);
              updateField("symbol", event.target.value.toUpperCase());
            }}
            placeholder="MNQ"
            required
          />
        </Field>
        {suggestedSymbol ? (
          <div className="live-suggestion-note">
            Suggested from the live chart: <strong>{suggestedSymbol}</strong>. You can edit or overwrite it.
          </div>
        ) : null}
        <Field label="Pre-session screenshot" hint="Capture is the default path. File upload is fallback.">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}
          />
          <div className="capture-actions">
            <Button type="button" onClick={handleCaptureScreenshot}>
              Capture screenshot
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload file
            </Button>
          </div>
          {screenshot ? <span className="capture-status">{screenshot.name}</span> : null}
          {captureHint ? <span className="field-hint">{captureHint}</span> : null}
        </Field>
        {error ? <div className="alert error-alert">{error}</div> : null}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create session"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
