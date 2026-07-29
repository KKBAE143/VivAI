/**
 * Decoder for the tagged audio frames a Team Viva room sends.
 *
 * Mirrors `backend/ai/audio_frames.py` — change both together.
 *
 * Why this exists: every binary frame used to be assumed to be AI speech at
 * 24 kHz. The room now relays human voice too, and a student mic is PCM16 at
 * 16 kHz — played back at 24 kHz it is audibly chipmunked. The header says which
 * it is, and who is speaking.
 *
 * Wire format (little-endian), 12 bytes then raw PCM:
 *   magic   2 bytes  "HX"
 *   version 1 byte   FRAME_VERSION
 *   kind    1 byte   KIND_AI | KIND_HUMAN
 *   rate    4 bytes  uint32 sample rate
 *   speaker 4 bytes  uint32 byte length of the speaker id that follows
 */
import { captureSilent } from "@/diagnostics/client";

export const FRAME_VERSION = 1;
export const KIND_AI = 0;
export const KIND_HUMAN = 1;
export const HEADER_SIZE = 12;

export const AI_SAMPLE_RATE = 24000;
export const HUMAN_SAMPLE_RATE = 16000;

/** "HX" */
const MAGIC_0 = 0x48;
const MAGIC_1 = 0x58;

export interface AudioFrame {
  kind: typeof KIND_AI | typeof KIND_HUMAN;
  sampleRate: number;
  speakerId: string;
  payload: ArrayBuffer;
}

/** Why a frame that claimed to be tagged could not be read. */
export type FrameRejection =
  | "version"
  | "kind"
  | "sample_rate"
  | "speaker_length"
  | "speaker_decode";

type FrameReporter = (reason: FrameRejection, byteLength: number) => void;

function defaultReporter(reason: FrameRejection, byteLength: number): void {
  captureSilent(new Error(`tagged audio frame rejected: ${reason}`), "frame_decode_failed", {
    feature: "team_viva",
    mode: "team_viva",
    reason,
    frames: byteLength,
  });
}

let reporter: FrameReporter = defaultReporter;

/**
 * Swap the reporter. A test seam, and only that.
 *
 * `captureSilent` is inert outside dev by design (see `diagnostics/client.ts`),
 * so without this there is no way to assert the diagnostic actually fires — and
 * an unasserted diagnostic is the same blind spot in a different place.
 */
export function setFrameDecodeReporter(fn: FrameReporter | null): void {
  reporter = fn ?? defaultReporter;
}

/**
 * Parse a tagged frame, or return null if this is not one.
 *
 * Returning null rather than throwing is deliberate: an untagged frame is what a
 * server that predates tagging sends, and that has to keep working as plain AI
 * audio rather than becoming an error in the WebSocket message handler.
 *
 * The two cases are NOT equally innocent, though, and used to be indistinguishable.
 * A buffer with no "HX" is an old server; a buffer that starts with "HX" and then
 * fails to parse is a protocol or codec bug on the live path, and its only
 * symptom is garbled or missing audio. Those get reported, then still fall back.
 */
export function decodeFrame(buffer: ArrayBuffer): AudioFrame | null {
  if (buffer.byteLength < HEADER_SIZE) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1) return null;

  // Past this point the sender told us it speaks our format, so every failure
  // below is a real fault rather than an old server.
  const reject = (reason: FrameRejection): null => {
    try {
      reporter(reason, buffer.byteLength);
    } catch {
      /* reporting must never break playback */
    }
    return null;
  };

  if (view.getUint8(2) !== FRAME_VERSION) return reject("version");

  const kind = view.getUint8(3);
  if (kind !== KIND_AI && kind !== KIND_HUMAN) return reject("kind");

  const sampleRate = view.getUint32(4, true);
  // A nonsense rate would make createBuffer throw deep inside playback; reject
  // it here where the fallback (treat as untagged) is still harmless.
  if (sampleRate < 8000 || sampleRate > 192000) return reject("sample_rate");

  const speakerLen = view.getUint32(8, true);
  const speakerEnd = HEADER_SIZE + speakerLen;
  if (speakerEnd > buffer.byteLength) return reject("speaker_length");

  let speakerId = "";
  if (speakerLen > 0) {
    try {
      speakerId = new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(buffer, HEADER_SIZE, speakerLen),
      );
    } catch {
      // A mangled speaker id would attribute relayed audio to nobody, so the
      // room would hear a voice it cannot label. Better to fall back loudly.
      return reject("speaker_decode");
    }
  }

  return {
    kind: kind as typeof KIND_AI | typeof KIND_HUMAN,
    sampleRate,
    speakerId,
    payload: buffer.slice(speakerEnd),
  };
}
