import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, getToken, setToken, setTokens, setRefreshToken, AUTH_LOGOUT_EVENT } from "./api";

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  /** True until the token has been read from localStorage on the client. */
  isLoading: boolean;
  login: (token: string, refreshToken?: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Read from localStorage after mount so SSR markup matches the first client render.
  useEffect(() => {
    const handleAuth = async () => {
      let currentToken = getToken();

      // On the password-recovery route, leave the hash token untouched so the
      // reset-password page can consume it instead of logging the user in.
      const isRecoveryRoute =
        typeof window !== "undefined" && window.location.pathname.startsWith("/reset-password");

      if (typeof window !== "undefined" && !isRecoveryRoute) {
        // 1. Check if there is an access_token in the URL hash (from Supabase OAuth redirect)
        if (window.location.hash) {
          try {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get("access_token");
            if (accessToken) {
              currentToken = accessToken;
              setTokens(accessToken, params.get("refresh_token"));
              // Clean the hash from the URL
              window.history.replaceState(null, "", window.location.pathname + window.location.search);
            }
          } catch (e) {
            console.error("Failed to parse OAuth hash token:", e);
          }
        }

        // 2. Check if there is a code in the URL query params (from PKCE flow redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) {
          try {
            const verifier = window.localStorage.getItem("supabase_code_verifier") || "";
            const res = await api<{ access_token: string; refresh_token?: string }>(
              `/api/auth/callback?code=${encodeURIComponent(code)}&code_verifier=${encodeURIComponent(verifier)}`
            );
            if (res.access_token) {
              currentToken = res.access_token;
              setTokens(res.access_token, res.refresh_token ?? null);
              // Clean the code and verifier
              window.localStorage.removeItem("supabase_code_verifier");
              urlParams.delete("code");
              const newSearch = urlParams.toString();
              const newPath = window.location.pathname + (newSearch ? "?" + newSearch : "");
              window.history.replaceState(null, "", newPath);
            }
          } catch (e) {
            console.error("Failed to exchange PKCE code:", e);
          }
        }
      }

      setTokenState(currentToken);
      setIsLoading(false);
    };

    void handleAuth();
  }, []);

  const login = useCallback((newToken: string, refreshToken?: string | null) => {
    setTokens(newToken, refreshToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setRefreshToken(null);
    setTokenState(null);
  }, []);

  // The api layer emits this when a session can no longer be refreshed
  // (expired / revoked). Clear local state so the app redirects to /login.
  useEffect(() => {
    const onForcedLogout = () => setTokenState(null);
    window.addEventListener(AUTH_LOGOUT_EVENT, onForcedLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onForcedLogout);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: Boolean(token), isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * Redirects to /login when the visitor is unauthenticated.
 * Returns { ready, isLoading } so pages can render a skeleton while checking.
 */
export function useRequireAuth(): { ready: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { ready: isAuthenticated, isLoading };
}
