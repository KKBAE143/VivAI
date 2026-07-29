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

/**
 * Parse a tagged frame, or return null if this is not one.
 *
 * Returning null rather than throwing is deliberate: an untagged frame is what a
 * server that predates tagging sends, and that has to keep working as plain AI
 * audio rather than becoming an error in the WebSocket message handler.
 */
export function decodeFrame(buffer: ArrayBuffer): AudioFrame | null {
  if (buffer.byteLength < HEADER_SIZE) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1) return null;
  if (view.getUint8(2) !== FRAME_VERSION) return null;

  const kind = view.getUint8(3);
  if (kind !== KIND_AI && kind !== KIND_HUMAN) return null;

  const sampleRate = view.getUint32(4, true);
  // A nonsense rate would make createBuffer throw deep inside playback; reject
  // it here where the fallback (treat as untagged) is still harmless.
  if (sampleRate < 8000 || sampleRate > 192000) return null;

  const speakerLen = view.getUint32(8, true);
  const speakerEnd = HEADER_SIZE + speakerLen;
  if (speakerEnd > buffer.byteLength) return null;

  const speakerId =
    speakerLen === 0
      ? ""
      : new TextDecoder().decode(new Uint8Array(buffer, HEADER_SIZE, speakerLen));

  return {
    kind: kind as typeof KIND_AI | typeof KIND_HUMAN,
    sampleRate,
    speakerId,
    payload: buffer.slice(speakerEnd),
  };
}
