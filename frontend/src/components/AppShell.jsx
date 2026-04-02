import { useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { fetchExtensionSessionStatus } from "../lib/api";
import { canTalkToExtension, shouldResyncExtensionAuth, syncExtensionAuth } from "../lib/extensionBridge";

export function AppShell({ children }) {
  const { logout, token, user } = useAuth();
  const navigate = useNavigate();
  const lastRecoveryAttemptAtRef = useRef(0);

  function handleLogout() {
    logout();
    navigate("/auth", { replace: true });
  }

  useEffect(() => {
    if (!token || !user?.email || !canTalkToExtension()) {
      return undefined;
    }

    let isActive = true;

    async function recoverExtensionAuth() {
      try {
        const extensionSession = await fetchExtensionSessionStatus(token);
        if (
          !isActive ||
          !shouldResyncExtensionAuth({
            extensionSession,
            hasExtensionMessaging: canTalkToExtension(),
            lastAttemptAt: lastRecoveryAttemptAtRef.current,
          })
        ) {
          return;
        }

        lastRecoveryAttemptAtRef.current = Date.now();
        await syncExtensionAuth({
          extensionId: extensionSession.extension_id,
          accessToken: token,
          userEmail: user.email,
        });
      } catch (error) {
        console.info("[AppShell] extension_auth_recovery_skipped", {
          message: error.message,
        });
      }
    }

    void recoverExtensionAuth();
    const intervalId = window.setInterval(() => {
      void recoverExtensionAuth();
    }, 30_000);
    const handleFocus = () => {
      void recoverExtensionAuth();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [token, user?.email]);

  return (
    <div className="app-frame">
      <header className="topbar glass-panel">
        <div>
          <p className="eyebrow">Tilt Guard</p>
          <h1>Trading journal</h1>
          <nav className="topbar-nav" aria-label="Primary">
            <NavLink className={({ isActive }) => `topbar-nav-link${isActive ? " active" : ""}`} to="/">
              Dashboard
            </NavLink>
            <NavLink
              className={({ isActive }) => `topbar-nav-link${isActive ? " active" : ""}`}
              to="/market-briefing"
            >
              Market briefing
            </NavLink>
          </nav>
        </div>
        <div className="topbar-actions">
          <div className="user-chip">
            <span className="status-dot" />
            {user?.email}
          </div>
          <button className="ghost-button" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
