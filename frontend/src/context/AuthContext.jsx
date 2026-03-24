import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getCurrentUser, loginRequest, registerRequest, setUnauthorizedHandler } from "../lib/api";

const TOKEN_STORAGE_KEY = "tilt-guard-token";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(token));
  const [authFailureReason, setAuthFailureReason] = useState("");

  function clearSession(reason = "") {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setAuthFailureReason(reason);
  }

  useEffect(() => {
    function handleUnauthorized({ message, path, status }) {
      console.warn("[AuthContext] protected_request_unauthorized", {
        message,
        path,
        status,
      });
      clearSession("Your session expired or became invalid. Please sign in again.");
    }

    setUnauthorizedHandler(handleUnauthorized);

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        if (isMounted) {
          setUser(currentUser);
          setAuthFailureReason("");
        }
      } catch (error) {
        if (isMounted) {
          console.warn("[AuthContext] bootstrap_failed", {
            message: error.message,
            status: error.status ?? null,
          });
          clearSession("Your session expired or became invalid. Please sign in again.");
        }
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function login(email, password) {
    const response = await loginRequest({ email, password });
    localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
    setToken(response.access_token);
    setUser(response.user);
    setAuthFailureReason("");
    return response.user;
  }

  async function register(email, password) {
    const response = await registerRequest({ email, password });
    localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
    setToken(response.access_token);
    setUser(response.user);
    setAuthFailureReason("");
    return response.user;
  }

  function logout() {
    clearSession("");
  }

  const value = useMemo(
    () => ({
      authFailureReason,
      clearAuthFailureReason: () => setAuthFailureReason(""),
      token,
      user,
      isAuthenticated: Boolean(token),
      isBootstrapping,
      login,
      register,
      logout,
    }),
    [authFailureReason, isBootstrapping, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
