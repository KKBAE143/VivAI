import { describe, expect, test } from "bun:test";
import { reducePresentationCoachState } from "../presentation-coach-state";

describe("presentation coach state", () => {
  test("snapshot, retry, advance, and reconnect remain server-authoritative", () => {
    let state = reducePresentationCoachState(null, {
      type: "state_snapshot",
      state: { version: 1, current_unit: 1 },
    });
    state = reducePresentationCoachState(state, {
      type: "coach_state",
      state: { version: 2, current_unit: 1, can_continue: true },
      evaluation: { decision: "retry" },
    });
    state = reducePresentationCoachState(state, {
      type: "unit_changed",
      state: { version: 3, current_unit: 2, can_continue: false },
      unit: { ordinal: 2, title: "Solution" },
    });
    state = reducePresentationCoachState(state, {
      type: "state_snapshot",
      state: { version: 3, current_unit: 2, unit: { ordinal: 2, title: "Solution" } },
    });

    expect(state?.version).toBe(3);
    expect(state?.current_unit).toBe(2);
    expect(state?.unit).toEqual({ ordinal: 2, title: "Solution" });
    expect(state?.can_continue).toBeUndefined();
  });
});
