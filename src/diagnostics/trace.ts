/**
 * Client-side trace ids.
 *
 * A `trace_id` spans one logical user operation end to end: the click, the API
 * call it makes, the WebSocket it opens, and every Gemini call the backend
 * performs inside it. `span_id` gives that trace its shape.
 *
 * Propagation differs per leg, because the platform forces it to:
 *  - HTTP  -> `x-diag-trace` / `x-diag-span` request headers.
 *  - WS    -> `?trace=&span=` query params. The browser WebSocket API cannot
 *             set custom headers, so the URL is the only channel available.
 *
 * Pure and dependency-free so it can run during SSR without touching `window`.
 */

/** Random, short, and collision-safe enough for a local diagnostics file. */
function rid(prefix: string): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newTraceId(): string {
  return rid("tr-");
}

export function newSpanId(): string {
  return rid("sp-");
}

/**
 * The trace covering the current user operation.
 *
 * Deliberately module-level rather than per-call: a click that fires four API
 * requests and then opens a WebSocket should produce ONE trace, not five. It is
 * rotated explicitly at operation boundaries (see `startTrace`).
 */
let activeTrace: string = newTraceId();
let activeSpan: string = newSpanId();

/** Begin a new logical operation. Returns the new trace id. */
export function startTrace(): string {
  activeTrace = newTraceId();
  activeSpan = newSpanId();
  return activeTrace;
}

export function currentTrace(): { traceId: string; spanId: string } {
  return { traceId: activeTrace, spanId: activeSpan };
}

/** Headers to attach to an outbound API request. */
export function traceHeaders(): Record<string, string> {
  return { "x-diag-trace": activeTrace, "x-diag-span": newSpanId() };
}

/** Query params to append to a WebSocket URL. */
export function traceQuery(): Record<string, string> {
  return { trace: activeTrace, span: newSpanId() };
}
