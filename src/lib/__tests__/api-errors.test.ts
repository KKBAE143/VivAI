import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { api, apiBlob, apiText, ApiError } from "../api";

/**
 * The backend's gates raise a structured detail (`{error, message}`) rather than
 * a bare string. The error parser only handled strings and validation arrays, so
 * every consent and role refusal reached the user as "Request failed (403)" —
 * the backend was explaining itself and nothing was listening.
 */
const realFetch = globalThis.fetch;

function respondWith(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("api() error details", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("surfaces a structured refusal's message and code", async () => {
    respondWith(403, {
      detail: {
        error: "consent_required",
        message: "You must accept the Privacy Policy before starting a session.",
      },
    });

    const error = (await api("/api/viva/sessions", { body: {} }).catch((e) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("consent_required");
    expect(error.message).toContain("accept the Privacy Policy");
  });

  it("carries the faculty gate's code so the UI can tell it apart", async () => {
    respondWith(403, {
      detail: { error: "faculty_required", message: "Faculty access is required." },
    });

    const error = (await api("/api/faculty/dashboard").catch((e) => e)) as ApiError;

    expect(error.code).toBe("faculty_required");
    expect(error.message).toBe("Faculty access is required.");
  });

  it("still reads a plain string detail", async () => {
    respondWith(404, { detail: "Session not found" });

    const error = (await api("/api/viva/sessions/x").catch((e) => e)) as ApiError;

    expect(error.message).toBe("Session not found");
    expect(error.code).toBeUndefined();
  });

  it("still joins validation errors", async () => {
    respondWith(422, { detail: [{ msg: "field required" }, { msg: "must be an integer" }] });

    const error = (await api("/api/viva/sessions", { body: {} }).catch((e) => e)) as ApiError;

    expect(error.message).toBe("field required, must be an integer");
  });

  it("falls back to a generic message for an unhelpful body", async () => {
    respondWith(500, { oops: true });

    const error = (await api("/api/viva/stats").catch((e) => e)) as ApiError;

    expect(error.message).toBe("Request failed (500)");
    expect(error.code).toBeUndefined();
  });

  it("returns successful CSV as text without changing JSON defaults", async () => {
    globalThis.fetch = (async () =>
      new Response('Name,Branch\r\n"Rao, Asha",CSE\r\n', {
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      })) as unknown as typeof fetch;

    expect(await apiText("/api/institution/export")).toBe('Name,Branch\r\n"Rao, Asha",CSE\r\n');
  });

  it("supports authenticated blob downloads", async () => {
    globalThis.fetch = (async () =>
      new Response("binary", {
        headers: { "Content-Type": "application/octet-stream" },
      })) as unknown as typeof fetch;

    const blob = await apiBlob("/api/files/x/download");
    expect(await blob.text()).toBe("binary");
  });

  it("still surfaces JSON errors when text mode was requested", async () => {
    respondWith(404, { detail: "No students in institution" });
    const error = (await apiText("/api/institution/export").catch((e) => e)) as ApiError;
    expect(error.message).toBe("No students in institution");
  });
});
