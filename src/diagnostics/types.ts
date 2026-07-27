/**
 * Shared event shape between the browser/SSR reporter and the Vite dev-server
 * middleware that writes it to disk. Mirrors the backend envelope in
 * `backend/core/diagnostics/handler.py` so one report can merge both.
 */

export const SCHEMA_VERSION = 1;

export type DiagSource = "frontend" | "ssr" | "vite";

export type DiagKind =
  | "exception"
  | "unhandled_rejection"
  | "render_error"
  | "http_error"
  | "network_error"
  | "ws_error"
  | "query_error"
  | "mutation_error"
  | "console_error"
  | "build_error"
  | "swallowed";

export interface DiagBreadcrumb {
  ts: string;
  type: "nav" | "http" | "ws" | "ui" | "log";
  msg: string;
}

export interface DiagError {
  type: string;
  message: string;
  stack?: string;
}

/**
 * Allowlisted context keys. Anything not listed is DROPPED rather than
 * redacted — a regex filter fails open on a shape it has not seen, an
 * allowlist fails closed. Kept in step with CONTEXT_ALLOWLIST in
 * `backend/core/diagnostics/handler.py`.
 */
export const CONTEXT_ALLOWLIST = [
  "route",
  "url_path",
  "method",
  "status",
  "feature",
  "component",
  "mode",
  "ws_code",
  "duration_ms",
  "query_key",
  "mutation_key",
  "retry_count",
  "attempt",
  "reason",
  "swallowed",
  "tag",
  "has_activity",
  "reconnects",
] as const;

export type DiagContext = Partial<Record<(typeof CONTEXT_ALLOWLIST)[number], unknown>>;

export interface DiagEvent {
  v: number;
  ts: string;
  source: DiagSource;
  kind: DiagKind;
  level: "ERROR" | "WARNING" | "INFO";
  message: string;
  run_id: string | null;
  session_id: string | null;
  /** From the backend's X-Request-Id — the join key between the two halves. */
  request_id?: string | null;
  /**
   * Spans one logical user operation: click -> API call -> WebSocket -> the
   * Gemini calls the backend makes inside it. Same field names as the backend
   * envelope so the report can merge both sides into a single tree.
   */
  trace_id?: string | null;
  span_id?: string | null;
  parent_span_id?: string | null;
  fingerprint: string;
  error?: DiagError;
  context?: DiagContext;
  breadcrumbs?: DiagBreadcrumb[];
}

export interface DiagBatch {
  run_id: string | null;
  session_id: string | null;
  events: DiagEvent[];
  /** Events shed by the queue overflow guard since the last flush. */
  dropped?: number;
}
