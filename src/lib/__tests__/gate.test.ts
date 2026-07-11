import { describe, expect, it } from "bun:test";

import { remainingPlaybackMs } from "../useLiveSession";

describe("remainingPlaybackMs", () => {
  it("returns the scheduled lead time in milliseconds", () => {
    // playHead is 2.5s ahead of the audio clock -> 2500ms still to drain.
    expect(remainingPlaybackMs(3.0, 0.5)).toBeCloseTo(2500, 5);
  });

  it("clamps to zero once playback has drained", () => {
    // Audio clock has passed the play head -> nothing left, never negative.
    expect(remainingPlaybackMs(1.0, 1.4)).toBe(0);
    expect(remainingPlaybackMs(2.0, 2.0)).toBe(0);
  });

  it("handles a fresh context (both at zero)", () => {
    expect(remainingPlaybackMs(0, 0)).toBe(0);
  });
});
