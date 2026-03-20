import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function AppShell({ children }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/auth", { replace: true });
  }

  return (
    <div className="app-frame">
      <header className="topbar glass-panel">
        <div>
          <p className="eyebrow">Tilt Guard</p>
          <h1>Trading journal</h1>
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
