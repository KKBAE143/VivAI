const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const TOKEN_KEY = "cpn_token";
const REFRESH_KEY = "cpn_refresh";

/** Broadcast so <AuthProvider> can clear its state and redirect to /login. */
export const AUTH_LOGOUT_EVENT = "cpn:auth-logout";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(REFRESH_KEY, token);
  else window.localStorage.removeItem(REFRESH_KEY);
}

/** Store both tokens at once (used on login / refresh). */
export function setTokens(access: string | null, refresh?: string | null): void {
  setToken(access);
  if (refresh !== undefined) setRefreshToken(refresh);
}

/** Clear every credential and tell the app the session is over. */
function clearSession(): void {
  setToken(null);
  setRefreshToken(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
  }
}

// A single in-flight refresh shared by every concurrent 401 so we don't fire
// dozens of refresh calls when a page makes many requests at once.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        clearSession();
        return null;
      }
      const data = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (!data.access_token) {
        clearSession();
        return null;
      }
      setTokens(data.access_token, data.refresh_token ?? refresh);
      return data.access_token;
    } catch {
      // Network hiccup — keep the tokens so the next attempt can retry.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Minimal typed fetch wrapper for the FastAPI backend.
 * - Attaches the Supabase JWT as a Bearer token when present.
 * - JSON-encodes plain object bodies; passes FormData through untouched.
 * - Defaults to POST when a body is provided, GET otherwise.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, signal } = options;
  const method = options.method ?? (body !== undefined ? "POST" : "GET");

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  };

  const payload: BodyInit | undefined =
    body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined;

  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(`${API_URL}${path}`, {
        method,
        headers: buildHeaders(),
        body: payload,
        signal,
      });
    } catch (err) {
      // Re-throw genuine aborts so React Query can treat them as cancellations.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // A fetch rejection has two very different causes and we must not conflate
      // them: (1) the backend is genuinely unreachable, or (2) the request hit
      // the backend but it crashed and the error response lacked CORS headers,
      // so the browser blocked it. The message names the method + path and both
      // realities so the user/logs can tell which one happened.
      const reason = err instanceof Error ? err.message : String(err);
      throw new ApiError(
        0,
        `Network error calling ${method} ${path}: ${reason}. Either the backend at ${API_URL} is unreachable, ` +
          `or it received the request but crashed and the browser blocked the response (CORS / server error). ` +
          `Check the backend logs.`,
      );
    }
  };

  let res = await doFetch();

  // Access token likely expired — try a one-time silent refresh, then retry.
  // Never do this for the refresh endpoint itself (avoids an infinite loop).
  if (res.status === 401 && !path.startsWith("/api/auth/refresh") && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data: unknown = await res.json();
      if (data && typeof data === "object" && "detail" in data) {
        const detail = (data as { detail: unknown }).detail;
        if (typeof detail === "string") message = detail;
        else if (Array.isArray(detail)) message = detail.map((d) => (d as { msg?: string }).msg ?? "").join(", ") || message;
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    // A 401 that survived the refresh attempt means the session is truly dead.
    if (res.status === 401) clearSession();
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Absolute URL for a backend path (e.g. for downloads). */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** WebSocket URL for a backend path. */
export function wsUrl(path: string): string {
  return `${API_URL.replace(/^http/, "ws")}${path}`;
}
