import { describe, expect, it } from "bun:test";

import { gateDrainTick, remainingPlaybackMs, type GateDrainState } from "../useLiveSession";

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

describe("gateDrainTick", () => {
  const PAD = 900;
  const base = { paused: false, paddingMs: PAD, deadline: 1_000_000 };

  /** Run a sequence of ticks and return whether/when the gate opened. */
  function run(ticks: { now: number; remainingMs: number; paused?: boolean }[]) {
    let state: GateDrainState = { quietSince: null };
    for (const tick of ticks) {
      const result = gateDrainTick(state, { ...base, ...tick, paused: tick.paused ?? false });
      state = result.state;
      if (result.open) return tick.now;
    }
    return null;
  }

  it("does not open while the greeting is still scheduled for playback", () => {
    expect(
      run([
        { now: 0, remainingMs: 4000 },
        { now: 500, remainingMs: 3500 },
      ]),
    ).toBeNull();
  });

  it("opens once playback has been drained for the full acoustic pad", () => {
    expect(
      run([
        { now: 0, remainingMs: 0 },
        { now: PAD, remainingMs: 0 },
      ]),
    ).toBe(PAD);
  });

  it("does not open a moment before the pad has elapsed", () => {
    expect(
      run([
        { now: 0, remainingMs: 0 },
        { now: PAD - 1, remainingMs: 0 },
      ]),
    ).toBeNull();
  });

  it("re-arms the pad when more greeting audio arrives after turn_complete", () => {
    // This is the regression: audio keeps arriving AFTER turn_complete, so a
    // deadline computed once at turn_complete opened the mic mid-greeting and
    // the greeting echoed back into Gemini as a student turn -> 2nd greeting.
    const opened = run([
      { now: 0, remainingMs: 0 }, // briefly quiet between chunks
      { now: 300, remainingMs: 2000 }, // more greeting audio scheduled
      { now: 600, remainingMs: 1000 },
      { now: 1000, remainingMs: 0 }, // now genuinely quiet — pad restarts here
      { now: 1000 + PAD - 1, remainingMs: 0 },
    ]);
    expect(opened).toBeNull();
    // …and it does open a tick later, PAD after the audio actually stopped.
    expect(
      run([
        { now: 0, remainingMs: 0 },
        { now: 300, remainingMs: 2000 },
        { now: 1000, remainingMs: 0 },
        { now: 1000 + PAD, remainingMs: 0 },
      ]),
    ).toBe(1000 + PAD);
  });

  it("never counts a paused session as drained", () => {
    expect(
      run([
        { now: 0, remainingMs: 0, paused: true },
        { now: 5000, remainingMs: 0, paused: true },
      ]),
    ).toBeNull();
  });

  it("opens at the deadline so a stalled audio clock cannot gate the mic forever", () => {
    const state: GateDrainState = { quietSince: null };
    const result = gateDrainTick(state, {
      now: 30_000,
      remainingMs: 9999, // clock stuck, playback never appears to drain
      paused: false,
      paddingMs: PAD,
      deadline: 30_000,
    });
    expect(result.open).toBe(true);
  });
});
