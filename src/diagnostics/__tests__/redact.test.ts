/**
 * The redaction gate (TypeScript side).
 *
 * KEEP IN SYNC with `backend/tests/test_diagnostics_redaction.py` — the two
 * files share an identical ordered corpus so a rule fixed in one language
 * cannot be silently forgotten in the other. Both assert CORPUS_SIZE.
 */
import { describe, expect, it } from "bun:test";

import { looksSecretKey, redactObj, redactText } from "../redact";

// Realistic shapes. None of these are real credentials.
const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFub24ifQ" +
  ".dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const FAKE_GOOGLE_KEY = "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY";
const FAKE_SUPABASE_KEY = "sb_publishable_AbCdEfGhIjKlMnOpQrStUv";

const CORPUS: [string, string, string[]][] = [
  ["bare jwt", FAKE_JWT, [FAKE_JWT, "eyJhbGci"]],
  ["authorization header", `Authorization: Bearer ${FAKE_JWT}`, [FAKE_JWT, "eyJhbGci"]],
  [
    // THE most important case: wsUrl() embeds the user's JWT in the query
    // string, and that URL reaches ws.onerror / breadcrumbs.
    "live session websocket url",
    `ws://localhost:8000/ws/live/viva/abc-123?token=${FAKE_JWT}&language=English&pv=1`,
    [FAKE_JWT, "eyJhbGci"],
  ],
  [
    "oauth callback url",
    "http://localhost:8080/auth/callback?code=4%2F0Ab_xYzLongAuthCode&code_verifier=s256verifierstring",
    ["4%2F0Ab_xYzLongAuthCode", "s256verifierstring"],
  ],
  [
    "google api key inline",
    `Gemini rejected the request: bad key ${FAKE_GOOGLE_KEY}`,
    [FAKE_GOOGLE_KEY],
  ],
  ["supabase publishable key", `anon=${FAKE_SUPABASE_KEY}`, [FAKE_SUPABASE_KEY]],
  ["env style assignment", "GEMINI_API_KEY=abcd1234efgh5678ijkl", ["abcd1234efgh5678ijkl"]],
  ["password assignment", "password=hunter2swordfish", ["hunter2swordfish"]],
  ["email address", "Contact kkbae143@gmail.com for access", ["kkbae143@gmail.com"]],
  [
    "data url audio payload",
    "data:audio/pcm;base64," + "QUJDREVG".repeat(600),
    ["QUJDREVGQUJDREVGQUJDREVG"],
  ],
  ["raw base64 audio chunk", "chunk: " + "QUJDREVG".repeat(900), ["QUJDREVGQUJDREVGQUJDREVG"]],
  ["bearer lowercase", `bearer ${FAKE_JWT}`, [FAKE_JWT]],
  [
    "opaque catch-all token",
    "opaque=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A",
    ["Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A"],
  ],
];

const CORPUS_SIZE = 13;

const PRESERVED: [string, string][] = [
  ["session id", "session_id=abc-123-def"],
  ["request id", "request_id=9a2b3c4d5e6f"],
  ["run id", "run_id=20260727-120000"],
  ["mode", "mode=viva"],
  ["event slug", "event=live_ws_stop"],
  ["plain message", "The session ended before you said anything."],
  ["http status", "status=500 method=POST path=/api/projects"],
];

describe("redactText", () => {
  it("corpus size matches the Python mirror", () => {
    // Guards the two-language parity contract. If you add a case here, add it
    // to backend/tests/test_diagnostics_redaction.py and bump both constants.
    expect(CORPUS.length).toBe(CORPUS_SIZE);
  });

  for (const [label, raw, forbidden] of CORPUS) {
    it(`no secret survives: ${label}`, () => {
      const out = redactText(raw);
      // Assert the redactor actually RAN. Without this, a totally broken
      // implementation returning the failure sentinel satisfies every
      // `not.toContain` below and the whole corpus passes vacuously.
      expect(out).not.toBe("[redaction failed]");
      expect(out.length).toBeGreaterThan(0);
      for (const needle of forbidden) {
        expect(out).not.toContain(needle);
      }
    });
  }

  it("tolerates a non-array second argument instead of failing closed", () => {
    // `.map(redactText)` supplies (value, index, array); the index landing in
    // the `extraLiterals` slot used to throw and be swallowed as
    // "[redaction failed]", silently losing the event instead of scrubbing it.
    // TypeScript rejects that call shape in app code, but SSR/plain-JS callers
    // and dynamic dispatch are not type-checked — hence the runtime guard.
    const loose = redactText as unknown as (t: string, x: unknown) => string;
    expect(loose("mode=viva", 0)).toBe("mode=viva");
    expect(loose("status=500", undefined)).toBe("status=500");
  });

  for (const [label, raw] of PRESERVED) {
    it(`correlation ids survive: ${label}`, () => {
      expect(redactText(raw)).toBe(raw);
    });
  }

  it("does not eat the rest of the line when redacting a secret", () => {
    // Regression: the KEY=VALUE rule's value class did not exclude `&`, so a
    // single `token=` swallowed the remainder of the query string — removing
    // the secret but destroying every other parameter with it.
    const out = redactText(
      `ws://localhost:8000/ws/live/viva/abc-123?token=${FAKE_JWT}&language=English&pv=1`,
    );
    expect(out).not.toContain(FAKE_JWT);
    expect(out).toContain("language=English");
    expect(out).toContain("pv=1");
    expect(out).toContain("/ws/live/viva/abc-123");
  });

  it("truncates very long strings", () => {
    const out = redactText("x".repeat(5000));
    expect(out.length).toBeLessThan(2200);
    expect(out).toContain("truncated");
  });

  it("substitutes caller-supplied literals", () => {
    const out = redactText("key is s3cret-value-here", [["s3cret-value-here", "[redacted:env]"]]);
    expect(out).not.toContain("s3cret-value-here");
  });

  it("never throws on empty input", () => {
    expect(redactText("")).toBe("");
  });
});

describe("looksSecretKey", () => {
  it("drops values under secret-looking keys", () => {
    for (const name of [
      "access_token",
      "refresh_token",
      "password",
      "supabase_service_role_key",
      "api_key",
      "authorization",
      "key",
    ]) {
      expect(looksSecretKey(name)).toBe(true);
    }
  });

  it("keeps the correlation ids that make a report navigable", () => {
    // The classic own-goal: a substring match on 'key'/'session' would redact
    // exactly the fields needed to correlate frontend and backend events.
    for (const name of [
      "session_id",
      "request_id",
      "run_id",
      "query_key",
      "mutation_key",
      "mode",
      "event",
      "reconnects",
    ]) {
      expect(looksSecretKey(name)).toBe(false);
    }
  });
});

describe("redactObj", () => {
  it("drops values under secret keys and keeps the rest", () => {
    const out = redactObj({
      access_token: FAKE_JWT,
      session_id: "abc-123",
      route: "/projects",
    }) as Record<string, unknown>;
    expect(out.access_token).toBe("[redacted:key]");
    expect(out.session_id).toBe("abc-123");
    expect(out.route).toBe("/projects");
  });

  it("walks nested structures", () => {
    const out = redactObj({ outer: { inner: { token: FAKE_JWT, mode: "viva" } } }) as {
      outer: { inner: Record<string, unknown> };
    };
    expect(out.outer.inner.token).toBe("[redacted:key]");
    expect(out.outer.inner.mode).toBe("viva");
  });

  it("does not hang on a circular structure", () => {
    const payload: Record<string, unknown> = { name: "loop" };
    payload.self = payload;
    expect(redactObj(payload)).toBeDefined();
  });

  it("never throws on hostile input", () => {
    for (const value of [null, undefined, 1, true, Symbol("x"), () => {}, [1, [2, [3]]]]) {
      expect(() => redactObj(value)).not.toThrow();
    }
  });
});
