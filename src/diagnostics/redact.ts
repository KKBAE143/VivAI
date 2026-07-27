/**
 * Secret redaction for the diagnostics sink (browser + SSR side).
 *
 * This is the client half of a two-stage scrub. It runs before anything leaves
 * the browser; the Vite dev-server middleware then runs the Node half, which
 * additionally substitutes real `process.env` secret values. A secret must
 * therefore survive BOTH stages to reach disk.
 *
 * Pure — no DOM, no node, no imports — so it is safe in every environment and
 * directly unit-testable.
 *
 * KEEP IN SYNC with `backend/core/diagnostics/redact.py`. The shared corpus
 * lives in `__tests__/redact.test.ts` and
 * `backend/tests/test_diagnostics_redaction.py`; both assert CORPUS_SIZE.
 */

export const MAX_STRING_CHARS = 2000;
const MAX_BASE64_RUN = 256;
const OPAQUE_TOKEN_MIN = 40;
const MAX_DEPTH = 6;

/**
 * Key names whose VALUE is dropped outright.
 *
 * Anchored on `(^|_)word($|_)` rather than a substring match, specifically so
 * `session_id`, `request_id`, `run_id`, `query_key` and `mutation_key` survive.
 * Those correlation ids are the whole reason a report is navigable — redacting
 * them is the classic own-goal for this kind of filter.
 */
const SECRET_KEY_RE =
  /(^|_)(token|secret|password|passwd|pwd|credential|credentials|cookie|jwt|bearer|api[-_]?key|apikey|access[-_]?key|private[-_]?key|refresh|authorization|auth|session[-_]?key|signature|sig|salt|nonce)($|_)/i;

/** Deliberate exceptions to the `*_key` rule below. */
const SAFE_KEY_NAMES = new Set([
  "query_key",
  "mutation_key",
  "cache_key",
  "route_key",
  "idempotency_key",
  "primary_key",
  "foreign_key",
  "sort_key",
]);

const SENSITIVE_QUERY_KEYS =
  "token|access_token|refresh_token|id_token|key|apikey|api_key|code|code_verifier|password|secret|signature|sig|auth|authorization|session";

/** Ordered: specific shapes first, catch-all last. */
const VALUE_PATTERNS: [RegExp, string][] = [
  // JWTs — covers Supabase anon AND service-role keys plus user access tokens.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[redacted:jwt]"],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]"],
  [/\bAIza[0-9A-Za-z_-]{10,}/g, "[redacted:google-key]"],
  [/\bsb[a-z]*_[A-Za-z0-9_-]{16,}/g, "[redacted:supabase-key]"],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, "[redacted:api-key]"],
  // Query-string values. This is what saves the output of `wsUrl()`, which
  // embeds the user's JWT as `?token=<jwt>`.
  [new RegExp(`([?&](?:${SENSITIVE_QUERY_KEYS})=)[^&\\s"'#]+`, "gi"), "$1[redacted]"],
  // KEY=VALUE pairs. The value class excludes `&` and `#`: without them a
  // single `token=` swallows the rest of the query string, removing the secret
  // but also destroying every other parameter alongside it.
  [
    /\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*)\s*[=:]\s*("?)([^\s"',;&#]+)/gi,
    "$1=$2[redacted]",
  ],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted:email]"],
];

const DATA_URL_RE = /(data:[\w.+-]+\/[\w.+-]+;base64,)[A-Za-z0-9+/=]{20,}/g;
const BASE64_RUN_RE = new RegExp(`[A-Za-z0-9+/]{${MAX_BASE64_RUN},}={0,2}`, "g");
// Explicit lookarounds rather than \b: `=` and `-` are non-word characters, so
// \b would not mean what it looks like it means here.
const OPAQUE_RE = new RegExp(
  `(?<![A-Za-z0-9_+/=-])[A-Za-z0-9_+/=-]{${OPAQUE_TOKEN_MIN},}(?![A-Za-z0-9_+/=-])`,
  "g",
);

/** Should the VALUE under this key be dropped outright? */
export function looksSecretKey(name: string): boolean {
  const lowered = name.trim().toLowerCase();
  if (SAFE_KEY_NAMES.has(lowered)) return false;
  if (SECRET_KEY_RE.test(lowered)) return true;
  return lowered === "key" || lowered.endsWith("_key");
}

/** Scrub secrets from a single string. Never throws. */
export function redactText(text: string, extraLiterals: [string, string][] = []): string {
  if (!text) return text;
  try {
    let out = text;
    // Tolerate a non-array second argument. `corpus.map(redactText)` passes the
    // array index here, and without this guard every such call fell into the
    // catch below and silently returned "[redaction failed]" — losing the
    // event instead of scrubbing it.
    if (Array.isArray(extraLiterals)) {
      for (const [literal, replacement] of extraLiterals) {
        if (literal && out.includes(literal)) out = out.split(literal).join(replacement);
      }
    }
    out = out.replace(
      DATA_URL_RE,
      (match, prefix: string) => `${prefix}[truncated ${match.length - prefix.length} bytes]`,
    );
    out = out.replace(BASE64_RUN_RE, (match) => `[base64 truncated ${match.length} bytes]`);
    for (const [pattern, replacement] of VALUE_PATTERNS) {
      out = out.replace(pattern, replacement);
    }
    out = out.replace(OPAQUE_RE, (match) => `[redacted:opaque:${match.length}]`);
    if (out.length > MAX_STRING_CHARS) {
      const dropped = out.length - MAX_STRING_CHARS;
      out = `${out.slice(0, MAX_STRING_CHARS)}…[truncated ${dropped} chars]`;
    }
    return out;
  } catch {
    // Drop the value rather than risk emitting an unredacted secret.
    return "[redaction failed]";
  }
}

/** Recursively scrub a JSON-ish structure. Never throws. */
export function redactObj(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  try {
    if (depth > MAX_DEPTH) return "[redacted:too-deep]";
    if (value === null || value === undefined) return value ?? null;
    const t = typeof value;
    if (t === "boolean" || t === "number") return value;
    if (t === "string") return redactText(value as string);
    if (t !== "object") return redactText(String(value));

    const obj = value as object;
    if (seen.has(obj)) return "[redacted:circular]";
    seen.add(obj);

    if (Array.isArray(value)) {
      return value.slice(0, 100).map((item) => redactObj(item, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      out[key] = looksSecretKey(key) ? "[redacted:key]" : redactObj(item, depth + 1, seen);
    }
    return out;
  } catch {
    return "[redaction failed]";
  }
}
