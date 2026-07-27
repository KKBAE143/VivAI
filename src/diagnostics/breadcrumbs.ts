/**
 * A short ring of "what happened just before".
 *
 * The single most common gap when reading a bug report is not knowing what the
 * user did before the error. Twenty entries covers a page load plus a handful
 * of interactions without turning the sink into a keystroke log.
 *
 * Pure and side-effect free on the server: every writer no-ops when there is no
 * `window`, so SSR never accumulates a shared, cross-request buffer.
 */
import type { DiagBreadcrumb } from "./types";
import { redactText } from "./redact";

const MAX_BREADCRUMBS = 20;
const MAX_MSG_CHARS = 200;

let ring: DiagBreadcrumb[] = [];

export function pushBreadcrumb(type: DiagBreadcrumb["type"], msg: string): void {
  if (typeof window === "undefined") return;
  try {
    ring.push({
      ts: new Date().toISOString(),
      type,
      msg: redactText(String(msg)).slice(0, MAX_MSG_CHARS),
    });
    if (ring.length > MAX_BREADCRUMBS) ring = ring.slice(-MAX_BREADCRUMBS);
  } catch {
    // A breadcrumb is never worth an exception.
  }
}

export function getBreadcrumbs(): DiagBreadcrumb[] {
  return ring.slice();
}

export function clearBreadcrumbs(): void {
  ring = [];
}
