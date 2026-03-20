import { Navigate } from "react-router-dom";

import { LoadingView } from "./LoadingView";
import { useAuth } from "../context/AuthContext";

export function AuthGate({ children }) {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <LoadingView label="Restoring access..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
