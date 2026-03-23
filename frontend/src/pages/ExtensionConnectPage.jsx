import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { syncExtensionAuth } from "../lib/extensionBridge";

export function ExtensionConnectPage() {
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const extensionId = searchParams.get("extensionId") || "";
  const requestedMode = searchParams.get("mode") || "";

  const modeLabel = useMemo(() => (requestedMode ? requestedMode.toUpperCase() : "UNKNOWN"), [requestedMode]);

  async function connectExtension() {
    if (!token || !user?.email) {
      return;
    }

    setStatus("syncing");
    setError("");

    try {
      await syncExtensionAuth({
        extensionId,
        accessToken: token,
        userEmail: user.email,
      });
      setStatus("connected");
    } catch (syncError) {
      setStatus("error");
      setError(syncError.message);
    }
  }

  useEffect(() => {
    if (token && user?.email && extensionId && status === "idle") {
      void connectExtension();
    }
  }, [extensionId, status, token, user?.email]);

  return (
    <div className="center-stage">
      <section className="auth-shell glass-panel">
        <div className="auth-copy">
          <p className="eyebrow">Extension handshake</p>
          <h1>Connect this journal session to your Tilt Guard extension.</h1>
          <p>
            Mode: <strong>{modeLabel}</strong>
          </p>
          <p>
            Extension ID: <span className="mono">{extensionId || "missing"}</span>
          </p>
          <p>
            Signed in as <strong>{user?.email}</strong>.
          </p>
        </div>
        <div className="auth-form">
          {status === "connected" ? (
            <div className="alert success-alert">
              Extension connected. You can return to TradingView and use the popup to confirm sync status.
            </div>
          ) : null}
          {status === "syncing" ? (
            <div className="alert warning-alert">Connecting extension...</div>
          ) : null}
          {error ? <div className="alert error-alert">{error}</div> : null}
          {!extensionId ? (
            <div className="alert error-alert">
              Missing extension handshake details. Open this page from the extension popup.
            </div>
          ) : null}
          <Button disabled={!extensionId || status === "syncing"} type="button" onClick={connectExtension}>
            {status === "syncing" ? "Connecting..." : "Connect extension"}
          </Button>
          <Link className="ghost-button" to="/">
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
