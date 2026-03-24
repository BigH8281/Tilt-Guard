import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { useAuth } from "../context/AuthContext";

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authFailureReason, clearAuthFailureReason, login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const next = searchParams.get("next") || "/";
  const showExpiredNotice = searchParams.get("reason") === "expired" && authFailureReason;

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form.email, form.password);
      }

      clearAuthFailureReason();
      navigate(next, { replace: true });
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="center-stage">
      <section className="auth-shell glass-panel">
        <div className="auth-copy">
          <p className="eyebrow">Execution discipline</p>
          <h1>Journal every decision before tilt writes the story for you.</h1>
          <p>
            Track pre-session bias, in-session execution, and post-session honesty
            in one dark, fast workspace.
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="segmented-control">
            <button
              className={mode === "login" ? "active" : ""}
              type="button"
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              type="button"
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>
          <Field label="Email">
            <input
              autoComplete="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              required
            />
          </Field>
          <Field label="Password" hint="Minimum 8 characters.">
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              required
            />
          </Field>
          {showExpiredNotice ? <div className="alert warning-alert">{authFailureReason}</div> : null}
          {error ? <div className="alert error-alert">{error}</div> : null}
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting
              ? mode === "login"
                ? "Signing in..."
                : "Creating account..."
              : mode === "login"
                ? "Login"
                : "Create account"}
          </Button>
        </form>
      </section>
    </div>
  );
}
