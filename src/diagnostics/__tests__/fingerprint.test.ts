/**
 * Fingerprinting decides what the report groups together. Too loose and
 * unrelated bugs merge into one useless bucket; too tight and the same bug
 * prints 400 times and buries everything else.
 *
 * KEEP IN SYNC with `backend/tests/test_diagnostics_fingerprint.py`.
 */
import { describe, expect, it } from "bun:test";

import { FINGERPRINT_LEN, fingerprint, normalizeMessage, topAppFrame } from "../fingerprint";

const JS_STACK = [
  "Error: boom",
  "    at flush (http://localhost:8080/node_modules/.vite/deps/chunk.js:12:3)",
  "    at useLiveSession (http://localhost:8080/src/lib/useLiveSession.ts:812:19)",
].join("\n");

describe("fingerprint", () => {
  it("groups the same bug carrying different ids and timings", () => {
    const a = fingerprint(
      "ApiError",
      "session 3f9a2b1c-1111-2222-3333-444455556666 failed after 12s",
    );
    const b = fingerprint(
      "ApiError",
      "session 8c7d6e5f-9999-8888-7777-666655554444 failed after 907s",
    );
    expect(a).toBe(b);
  });

  it("does not group different messages", () => {
    expect(fingerprint("ApiError", "bad rubric")).not.toBe(
      fingerprint("ApiError", "missing transcript"),
    );
  });

  it("does not group different error types", () => {
    expect(fingerprint("ApiError", "boom")).not.toBe(fingerprint("TypeError", "boom"));
  });

  it("does not group the same message from different call sites", () => {
    const other = JS_STACK.replace("useLiveSession.ts", "useTeamViva.ts");
    expect(other).toContain("useTeamViva.ts");
    expect(fingerprint("Error", "x", JS_STACK)).not.toBe(fingerprint("Error", "x", other));
  });

  it("does not split a group over differing redaction placeholders", () => {
    expect(fingerprint("ApiError", "auth failed for [redacted:jwt]")).toBe(
      fingerprint("ApiError", "auth failed for [redacted:opaque:88]"),
    );
  });

  it("is short and stable", () => {
    const first = fingerprint("Error", "boom", JS_STACK);
    expect(first.length).toBe(FINGERPRINT_LEN);
    expect(first).toBe(fingerprint("Error", "boom", JS_STACK));
  });

  it("never throws on missing input", () => {
    expect(fingerprint(null, null, null)).toBeTruthy();
    expect(normalizeMessage("")).toBe("");
    expect(topAppFrame(null)).toBe("");
  });
});

describe("topAppFrame", () => {
  it("skips vendor frames in favour of app frames", () => {
    // Grouping on a node_modules frame would merge every unrelated bug that
    // happens to surface inside the same library helper.
    expect(topAppFrame(JS_STACK)).toBe("useLiveSession.ts:812:useLiveSession");
  });

  it("understands python tracebacks too (SSR proxies backend stacks)", () => {
    const stack = [
      "Traceback (most recent call last):",
      '  File "C:\\app\\backend\\.venv\\Lib\\site-packages\\anyio\\_asyncio.py", line 807, in run',
      '  File "C:\\app\\backend\\api\\live.py", line 447, in finalize',
      "ValueError: bad rubric",
    ].join("\n");
    expect(topAppFrame(stack)).toBe("live.py:447:finalize");
  });
});
