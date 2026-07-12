import { describe, expect, it } from "bun:test";

import { taskDerivedProgress } from "../utils";

describe("taskDerivedProgress", () => {
  it("returns null for an empty task list (nothing to suggest)", () => {
    expect(taskDerivedProgress([])).toBeNull();
  });

  it("weights Done full, Review partial, In Progress less, To Do zero", () => {
    const tasks = [
      { status: "Done" },
      { status: "Review" },
      { status: "In Progress" },
      { status: "To Do" },
    ];
    // (1 + 0.75 + 0.4 + 0) / 4 = 0.5375 -> 54%
    expect(taskDerivedProgress(tasks)).toBe(54);
  });

  it("treats a missing/unknown status as To Do (zero weight)", () => {
    expect(taskDerivedProgress([{ status: "Done" }, {}])).toBe(50);
  });

  it("returns 100 when every task is Done", () => {
    expect(taskDerivedProgress([{ status: "Done" }, { status: "Done" }])).toBe(100);
  });
});
