import { Navigate, useSearchParams } from "react-router-dom";

import { LoadingView } from "./LoadingView";
import { useAuth } from "../context/AuthContext";

export function AuthGate({ children }) {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/";

  if (isBootstrapping) {
    return <LoadingView label="Restoring access..." />;
  }

  if (isAuthenticated) {
    return <Navigate to={next} replace />;
  }

  return children;
}
