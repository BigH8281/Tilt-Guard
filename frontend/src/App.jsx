import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { AuthGate } from "./components/AuthGate";
import { LoadingView } from "./components/LoadingView";
import { useAuth } from "./context/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExtensionConnectPage } from "./pages/ExtensionConnectPage";
import { JournalPage } from "./pages/JournalPage";
import { SystemStatusPage } from "./pages/SystemStatusPage";

function ProtectedRoute({ children }) {
  const { authFailureReason, isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <LoadingView label="Syncing your journal..." />;
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    const reason = authFailureReason ? "&reason=expired" : "";
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}${reason}`} replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <AuthGate>
            <AuthPage />
          </AuthGate>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell>
              <DashboardPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions/:sessionId"
        element={
          <ProtectedRoute>
            <AppShell>
              <JournalPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions/:sessionId/system-status"
        element={
          <ProtectedRoute>
            <AppShell>
              <SystemStatusPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/extension/connect"
        element={
          <ProtectedRoute>
            <ExtensionConnectPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
