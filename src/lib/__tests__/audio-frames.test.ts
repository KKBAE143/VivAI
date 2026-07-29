import { describe, expect, it } from "bun:test";

import {
  AI_SAMPLE_RATE,
  decodeFrame,
  FRAME_VERSION,
  HEADER_SIZE,
  HUMAN_SAMPLE_RATE,
  KIND_AI,
  KIND_HUMAN,
} from "../audio-frames";

/** Build a frame the way the Python encoder does, so this tests the real format. */
function encode(
  kind: number,
  sampleRate: number,
  speakerId: string,
  payload: number[],
  version = FRAME_VERSION,
): ArrayBuffer {
  const speaker = new TextEncoder().encode(speakerId);
  const buf = new ArrayBuffer(HEADER_SIZE + speaker.length + payload.length);
  const view = new DataView(buf);
  view.setUint8(0, 0x48); // H
  view.setUint8(1, 0x58); // X
  view.setUint8(2, version);
  view.setUint8(3, kind);
  view.setUint32(4, sampleRate, true);
  view.setUint32(8, speaker.length, true);
  const bytes = new Uint8Array(buf);
  bytes.set(speaker, HEADER_SIZE);
  bytes.set(payload, HEADER_SIZE + speaker.length);
  return buf;
}

describe("decodeFrame", () => {
  it("reads AI speech as 24kHz with no speaker", () => {
    const frame = decodeFrame(encode(KIND_AI, AI_SAMPLE_RATE, "", [1, 2, 3]));
    expect(frame).not.toBeNull();
    expect(frame!.kind).toBe(KIND_AI);
    expect(frame!.sampleRate).toBe(24000);
    expect(frame!.speakerId).toBe("");
    expect([...new Uint8Array(frame!.payload)]).toEqual([1, 2, 3]);
  });

  it("reads human speech as 16kHz and names the speaker", () => {
    // The whole point: this must NOT be played back at the AI's 24kHz.
    const frame = decodeFrame(encode(KIND_HUMAN, HUMAN_SAMPLE_RATE, "profile-42", [9]));
    expect(frame!.kind).toBe(KIND_HUMAN);
    expect(frame!.sampleRate).toBe(16000);
    expect(frame!.speakerId).toBe("profile-42");
  });

  it("handles a unicode speaker id", () => {
    expect(decodeFrame(encode(KIND_HUMAN, 16000, "student-éł", [0]))!.speakerId).toBe("student-éł");
  });

  it("handles an empty payload", () => {
    expect(decodeFrame(encode(KIND_AI, 24000, "", []))!.payload.byteLength).toBe(0);
  });

  it("returns null for untagged audio so old servers keep working", () => {
    // A server that predates tagging sends bare PCM. That must stay playable as
    // AI audio, not become an error in the message handler.
    const raw = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
    ]);
    expect(decodeFrame(raw.buffer)).toBeNull();
  });

  it("returns null for a buffer too short to hold a header", () => {
    expect(decodeFrame(new ArrayBuffer(4))).toBeNull();
  });

  it("returns null for an unknown version rather than guessing the layout", () => {
    expect(decodeFrame(encode(KIND_AI, 24000, "", [1], 99))).toBeNull();
  });

  it("returns null for an unknown kind", () => {
    expect(decodeFrame(encode(7, 24000, "", [1]))).toBeNull();
  });

  it("returns null when the speaker length runs past the buffer", () => {
    // Never read past the end because a header claimed a longer name.
    const buf = encode(KIND_HUMAN, 16000, "abc", [1]);
    new DataView(buf).setUint32(8, 999, true);
    expect(decodeFrame(buf)).toBeNull();
  });

  it("rejects an absurd sample rate before it reaches createBuffer", () => {
    expect(decodeFrame(encode(KIND_HUMAN, 5, "a", [1]))).toBeNull();
    expect(decodeFrame(encode(KIND_HUMAN, 999999, "a", [1]))).toBeNull();
  });
});
