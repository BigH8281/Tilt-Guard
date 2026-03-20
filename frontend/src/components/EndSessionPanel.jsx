import { useEffect, useRef, useState } from "react";

import { Button } from "./Button";
import { Field } from "./Field";
import { captureDisplayFrame } from "../lib/screenCapture";

const initialState = {
  end_traded_my_time: true,
  end_traded_my_conditions: true,
  end_respected_my_exit: true,
  reason_time_no: "",
  reason_conditions_no: "",
  reason_exit_no: "",
};

function ToggleRow({ checked, label, onChange }) {
  return (
    <label className="panel-toggle-row">
      <span>{label}</span>
      <select value={checked ? "yes" : "no"} onChange={onChange}>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

export function EndSessionPanel({
  error,
  hasPostScreenshot,
  isSubmitting,
  onCancel,
  onSubmit,
  sessionId,
}) {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState(initialState);
  const [postScreenshot, setPostScreenshot] = useState(null);
  const [captureHint, setCaptureHint] = useState("");

  useEffect(() => {
    setForm(initialState);
    setPostScreenshot(null);
  }, []);

  function updateBoolean(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value === "yes",
    }));
  }

  function updateText(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit(form, postScreenshot);
  }

  async function handleCaptureScreenshot() {
    setCaptureHint("");

    try {
      const file = await captureDisplayFrame(`session-${sessionId}-post`);
      setPostScreenshot(file);
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
    <form className="side-panel side-form glass-panel" onSubmit={handleSubmit}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Closeout</p>
          <h3>End session</h3>
        </div>
      </div>
      <ToggleRow
        checked={form.end_traded_my_time}
        label="Traded my time"
        onChange={(event) => updateBoolean("end_traded_my_time", event.target.value)}
      />
      {!form.end_traded_my_time ? (
        <Field label="Reason">
          <textarea
            rows="3"
            value={form.reason_time_no}
            onChange={(event) => updateText("reason_time_no", event.target.value)}
          />
        </Field>
      ) : null}
      <ToggleRow
        checked={form.end_traded_my_conditions}
        label="Traded my conditions"
        onChange={(event) => updateBoolean("end_traded_my_conditions", event.target.value)}
      />
      {!form.end_traded_my_conditions ? (
        <Field label="Reason">
          <textarea
            rows="3"
            value={form.reason_conditions_no}
            onChange={(event) => updateText("reason_conditions_no", event.target.value)}
          />
        </Field>
      ) : null}
      <ToggleRow
        checked={form.end_respected_my_exit}
        label="Respected my exit"
        onChange={(event) => updateBoolean("end_respected_my_exit", event.target.value)}
      />
      {!form.end_respected_my_exit ? (
        <Field label="Reason">
          <textarea
            rows="3"
            value={form.reason_exit_no}
            onChange={(event) => updateText("reason_exit_no", event.target.value)}
          />
        </Field>
      ) : null}
      <Field
        label="Post-session screenshot"
        hint={hasPostScreenshot ? "Already present. Upload another if needed." : "Required before close."}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => setPostScreenshot(event.target.files?.[0] ?? null)}
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
        {postScreenshot ? <span className="capture-status">{postScreenshot.name}</span> : null}
        {captureHint ? <span className="field-hint">{captureHint}</span> : null}
      </Field>
      {!hasPostScreenshot && !postScreenshot ? (
        <div className="alert warning-alert">Upload a post-session screenshot first.</div>
      ) : null}
      {error ? <div className="alert error-alert">{error}</div> : null}
      <div className="toolbar-row">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={isSubmitting}>
          {isSubmitting ? "Closing..." : "Confirm close"}
        </Button>
      </div>
    </form>
  );
}
