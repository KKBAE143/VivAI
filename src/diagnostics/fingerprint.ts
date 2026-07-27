/**
 * Group equivalent errors so a report shows 4 problems, not 400 lines.
 *
 * Two occurrences of the same bug almost never produce byte-identical text:
 * ids, timings, ports and paths differ. Normalising those away lets the report
 * say "this happened 87 times" instead of printing 87 near-duplicates.
 *
 * Pure — no DOM, no node, no imports.
 *
 * KEEP IN SYNC with `backend/core/diagnostics/fingerprint.py`.
 */

export const FINGERPRINT_LEN = 12;

/** Variable fragments -> stable placeholders. Most specific first. */
const NORMALISERS: [RegExp, string][] = [
  [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, "<uuid>"],
  [/\b[0-9a-fA-F]{16,}\b/g, "<hex>"],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, "<ts>"],
  [/\[redacted[^\]]*\]/g, "<redacted>"],
  // Numbers including a unit suffix ("12s", "907ms"): without allowing the
  // suffix, "failed after 12s" and "failed after 907s" fingerprint differently
  // and one bug splits into a bucket per duration.
  [/(?<![A-Za-z0-9_])\d+(?:\.\d+)?/g, "<n>"],
  [/[A-Za-z]:\\[^\s"']+\\([^\\\s"']+)/g, "<path>/$1"],
  [/(?<![\w.])\/(?:[\w.-]+\/)+([\w.-]+)/g, "<path>/$1"],
  [/\s+/g, " "],
];

/** Frames belonging to the runtime or third-party code, not this app. */
const VENDOR_MARKERS = [
  "site-packages",
  "lib/python",
  "lib\\python",
  "node_modules",
  "<frozen ",
  "importlib",
  "asyncio/",
  "asyncio\\",
  "/dist/",
  "\\dist\\",
];

const PY_FRAME_RE = /File "([^"]+)", line (\d+), in (\S+)/g;
const JS_FRAME_RE = /at\s+(?:([^\s(]+)\s+)?\(?([^\s()]+?):(\d+):(\d+)\)?/g;

/** Strip the parts of a message that vary between occurrences. */
export function normalizeMessage(message: string): string {
  if (!message) return "";
  let text = message.trim();
  for (const [pattern, replacement] of NORMALISERS) {
    text = text.replace(pattern, replacement);
  }
  return text.trim().slice(0, 300);
}

function isAppFrame(text: string): boolean {
  const lowered = text.toLowerCase();
  return !VENDOR_MARKERS.some((marker) => lowered.includes(marker));
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/**
 * The most specific frame belonging to this app.
 *
 * Vendor frames are skipped: two different bugs both surfacing inside
 * `asyncio/tasks.py` are different bugs, and grouping on that frame would
 * merge unrelated failures into one useless bucket.
 */
export function topAppFrame(stack: string | null | undefined): string {
  if (!stack) return "";
  const pyFrames: string[] = [];
  for (const match of stack.matchAll(PY_FRAME_RE)) {
    const [, path, line, func] = match;
    if (isAppFrame(path)) pyFrames.push(`${basename(path)}:${line}:${func}`);
  }
  // Python tracebacks are outermost-first, so the last app frame is the raiser.
  if (pyFrames.length > 0) return pyFrames[pyFrames.length - 1];

  for (const match of stack.matchAll(JS_FRAME_RE)) {
    const [, func, path, line] = match;
    if (isAppFrame(path)) return `${basename(path)}:${line}:${func || "?"}`;
  }
  return "";
}

/**
 * FNV-1a, 32-bit, rendered as hex and repeated to FINGERPRINT_LEN.
 *
 * The Python side uses sha1, so fingerprints are NOT comparable across the two
 * languages — they never need to be, because grouping happens per source. A
 * synchronous non-crypto hash avoids pulling in SubtleCrypto (async, and
 * unavailable on insecure origins).
 */
function hash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(
    0,
    FINGERPRINT_LEN,
  );
}

/** Stable short id for "this same problem". */
export function fingerprint(
  errorType: string | null | undefined,
  message: string | null | undefined,
  stack?: string | null,
): string {
  const parts = [(errorType || "").trim(), normalizeMessage(message || ""), topAppFrame(stack)];
  return hash(parts.join("|"));
}
