const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const TOKEN_KEY = "cpn_token";

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
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal });

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
    if (res.status === 401) setToken(null);
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
