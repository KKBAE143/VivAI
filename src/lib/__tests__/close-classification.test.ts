import { describe, expect, it } from "bun:test";

import { classifyClose } from "../useLiveSession";

/**
 * A dropped live session produced one sentence for every possible cause, and one
 * of its two claims was usually wrong.
 */
describe("classifyClose", () => {
  it("names a superseded connection instead of asking for a retry", () => {
    // 4409 means another tab, a reload, or a dev hot reload took the session
    // over. Retrying in this tab is exactly the wrong advice.
    const { reason, message } = classifyClose({ code: 4409, hadActivity: true });
    expect(reason).toBe("superseded");
    expect(message).toContain("another tab");
    expect(message).not.toContain("Please retry");
  });

  it("calls a 1006 what it is", () => {
    const { reason, message } = classifyClose({ code: 1006, hadActivity: true });
    expect(reason).toBe("network");
    expect(message).toContain("network");
  });

  it("reports an expired sign-in as an auth problem", () => {
    expect(classifyClose({ code: 4401, hadActivity: false }).reason).toBe("auth");
  });

  it("reports a missing session distinctly", () => {
    expect(classifyClose({ code: 4404, hadActivity: false }).reason).toBe("session_gone");
  });

  it("falls back to a server-side cause for an unknown code", () => {
    expect(classifyClose({ code: 1011, hadActivity: false }).reason).toBe("server");
  });

  it("does NOT claim nothing was recorded when the student had spoken", () => {
    // The server finalizes a lost socket whenever there was activity, so the
    // session is normally graded. Telling the student otherwise makes them re-sit
    // an exam they already completed.
    for (const code of [4409, 4404, 4401, 1006, 1011]) {
      const { message } = classifyClose({ code, hadActivity: true });
      expect(message).toContain("was saved");
      expect(message).not.toContain("Nothing was recorded");
    }
  });

  it("says so plainly when there really was nothing to save", () => {
    const { message } = classifyClose({ code: 1006, hadActivity: false });
    expect(message).toContain("Nothing was recorded");
    expect(message).not.toContain("was saved");
  });
});
