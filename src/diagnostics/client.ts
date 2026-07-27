/**
 * Browser-side diagnostics capture.
 *
 * Dev-only, and guarded on `typeof window` so it is structurally unreachable
 * during SSR.
 *
 * On what "dev-only" means in the shipped bundle, precisely: the TRANSPORT is
 * statically eliminated (see `transport.ts`), so a production build contains no
 * ingest endpoint and no code path that can send anything. This module itself
 * is still present but inert — `report()` is called from ~10 places, so Rollup
 * cannot drop an exported function that is genuinely referenced. The cost is a
 * couple of KB of unreachable code, not a live reporting channel.
 *
 * The cardinal rule: this module must never change how the app behaves. Every
 * exported function swallows its own failures, returns void, and is safe to
 * call from inside a `catch` block that is about to continue as before.
 */
import { pushBreadcrumb, getBreadcrumbs } from "./breadcrumbs";
import { fingerprint } from "./fingerprint";
import { redactObj, redactText } from "./redact";
import { currentTrace } from "./trace";
import { enqueue, flush } from "./transport";
import { CONTEXT_ALLOWLIST, SCHEMA_VERSION } from "./types";
import type { DiagContext, DiagError, DiagEvent, DiagKind, DiagSource } from "./types";

const SESSION_KEY = "cpn_diag_session";

let initialised = false;

/**
 * Dev-only.
 *
 * This MUST be a bare `import.meta.env.DEV` at module scope. Vite replaces that
 * expression with the literal `false` at build time, which lets Rollup prove
 * the guarded bodies are unreachable and drop them. Wrapping it in a function
 * with a try/catch (the obvious defensive instinct) defeats the substitution
 * and ships the whole reporter — endpoint string included — to production.
 */
const ENABLED: boolean = import.meta.env.DEV;

function enabled(): boolean {
  return ENABLED;
}

function runId(): string | null {
  try {
    // Injected by vite.config.ts from HORUX_RUN_ID so browser events line up
    // with the backend events from the same `start-app.bat`.
    return (globalThis as { __DIAG_RUN_ID__?: string }).__DIAG_RUN_ID__ ?? null;
  } catch {
    return null;
  }
}

function sessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `tab-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null; // private mode / storage disabled
  }
}

function toError(value: unknown): DiagError {
  if (value instanceof Error) {
    return {
      type: value.name || "Error",
      message: redactText(value.message || String(value)),
      stack: value.stack ? redactText(value.stack, []) : undefined,
    };
  }
  if (value && typeof value === "object") {
    return { type: "object", message: redactText(safeStringify(value)) };
  }
  return { type: typeof value, message: redactText(String(value)) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(redactObj(value));
  } catch {
    return String(value);
  }
}

function pickContext(context: Record<string, unknown> | undefined): DiagContext | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of CONTEXT_ALLOWLIST) {
    if (context[key] !== undefined && context[key] !== null) out[key] = context[key];
  }
  const cleaned = redactObj(out) as Record<string, unknown>;
  return Object.keys(cleaned).length > 0 ? (cleaned as DiagContext) : undefined;
}

function currentRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.location.pathname;
  } catch {
    return undefined;
  }
}

/** Record one diagnostic event. Never throws, never returns a value to act on. */
export function report(
  value: unknown,
  options: {
    kind?: DiagKind;
    source?: DiagSource;
    level?: DiagEvent["level"];
    message?: string;
    context?: Record<string, unknown>;
  } = {},
): void {
  if (!enabled()) return;
  try {
    const error = toError(value);
    const context = pickContext({ route: currentRoute(), ...options.context });
    const event: DiagEvent = {
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      source: options.source ?? "frontend",
      kind: options.kind ?? "exception",
      level: options.level ?? "ERROR",
      message: redactText(options.message ?? error.message),
      run_id: runId(),
      session_id: sessionId(),
      request_id:
        (options.context?.request_id as string | undefined) ??
        (options.context?.requestId as string | undefined) ??
        null,
      trace_id: (options.context?.trace_id as string | undefined) ?? currentTrace().traceId,
      span_id: (options.context?.span_id as string | undefined) ?? currentTrace().spanId,
      fingerprint: fingerprint(error.type, error.message, error.stack),
      error,
      ...(context ? { context } : {}),
      breadcrumbs: getBreadcrumbs(),
    };
    enqueue(event);
  } catch {
    /* diagnostics must never break the caller */
  }
}

/**
 * Record something an app `catch` block is deliberately ignoring.
 *
 * Used to convert the ~45 silent `catch {}` blocks into "still ignored, but no
 * longer invisible". Logged at WARNING because the app decided it was
 * survivable — the point is that it stops being unknowable, not that it starts
 * being fatal.
 */
export function captureSilent(
  value: unknown,
  tag: string,
  context?: Record<string, unknown>,
): void {
  report(value, {
    kind: "swallowed",
    level: "WARNING",
    context: { ...context, tag, swallowed: true },
  });
}

/** Record a breadcrumb (cheap, not an event). */
export const breadcrumb = pushBreadcrumb;

/**
 * Attach the global listeners. Idempotent; safe to call from a React effect.
 *
 * Note `src/lib/error-capture.ts` already registers these two listeners, but it
 * is imported only by `src/server.ts`, so it has only ever run on the server —
 * the browser has had no global error capture at all.
 */
export function initDiagnostics(): void {
  if (!enabled() || initialised || typeof window === "undefined") return;
  initialised = true;
  try {
    window.addEventListener("error", (event) => {
      report((event as ErrorEvent).error ?? (event as ErrorEvent).message, {
        kind: "exception",
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      report((event as PromiseRejectionEvent).reason, { kind: "unhandled_rejection" });
    });

    // Chain, never replace: the developer's console output must be unchanged.
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      try {
        const first = args.find((a) => a instanceof Error);
        report(first ?? args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "), {
          kind: "console_error",
          level: "WARNING",
        });
      } catch {
        /* ignore */
      }
      originalError.apply(console, args as Parameters<typeof console.error>);
    };

    window.addEventListener("pagehide", () => flush(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });

    pushBreadcrumb("nav", `loaded ${currentRoute() ?? ""}`);
  } catch {
    /* a failure to instrument must not break the page */
  }
}
