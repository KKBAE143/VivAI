/**
 * useLiveSession — the real-time, conversational AI engine (client side).
 *
 * Streams the student's mic (PCM16 mono 16kHz) and screen/camera frames
 * (JPEG ~1fps) to our FastAPI `/ws/live/...` proxy, which bridges to the
 * Gemini Live API. Plays back the AI's natural speech (PCM 24kHz) gaplessly,
 * supports barge-in (interruption), and surfaces live captions + structured
 * events (commentary, questions, scores) for the UI.
 *
 * The heavy media plumbing lives here so the session pages stay declarative.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, wsUrl } from "@/lib/api";
import { captureSilent, report } from "@/diagnostics/client";
import { startTrace, traceQuery } from "@/diagnostics/trace";

export type LiveStatus = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "error";
export type LiveMode = "viva" | "presentation" | "pitch" | "coach";

export interface LiveCaption {
  role: "student" | "examiner";
  text: string;
  ts: number;
}

export interface LiveEvent {
  /** Client-generated, unique per event — used as the React key. */
  id: string;
  /** Server-generated correlation id (e.g. "q_3"), present on question/score/
   * observation events. A "score" event's refId names the "question" event
   * it belongs to, so the UI can group them into one evolving evaluation
   * instead of two disconnected list entries. */
  refId?: string | null;
  kind: "flag" | "observation" | "question" | "score";
  /** For observation/flag events only: whether this specific moment was a
   * strength, an issue, or a neutral note — distinct from `kind` above,
   * which is the event envelope type, not the observation's own verdict. */
  observationKind?: "strength" | "issue" | "note" | null;
  text: string;
  topic?: string | null;
  score?: number | null;
  severity?: string | null;
  category?: string | null;
  dimension?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  tip?: string | null;
  ts: number;
}

export interface LiveSummary {
  overall_score?: number;
  questions?: unknown[];
  flags?: unknown[];
  transcript?: unknown[];
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  coach_metrics?: Record<string, number>;
  /**
   * The report is real but the conversation was cut short by a connection
   * failure rather than by the examiner wrapping up.
   */
  ended_early?: boolean;
}

export interface StartOptions {
  micStream: MediaStream;
  /** Optional screen/camera stream sampled at ~1fps and sent to the model. */
  videoStream?: MediaStream | null;
  /** What the video stream is, so the server can track availability for the
   * report (body-language findings require a camera, not a screen share). */
  videoSource?: "camera" | "screen" | null;
  /** Prefer a context already resumed under a user gesture (preflight Start). */
  playbackAudioContext?: AudioContext | null;
}

export interface UseLiveSessionOptions {
  mode: LiveMode;
  sessionId: string;
  language?: string;
  persona?: string;
  projectId?: string | null;
  /** Free-text subject / topic / focus so the examiner personalizes questions. */
  subject?: string | null;
}

// ~1 frame per second keeps us within the Live API video budget.
const FRAME_INTERVAL_MS = 1000;
const FRAME_MAX_WIDTH = 768;
const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_SAMPLE_RATE = 16000;

// AudioWorklet processor (as a Blob URL so it needs no separate public file).
const RECORDER_WORKLET = `
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      const copy = new Float32Array(ch);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

function floatToPCM16(input: Float32Array, inRate: number): ArrayBuffer {
  if (inRate === CAPTURE_SAMPLE_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }
  const ratio = inRate / CAPTURE_SAMPLE_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

let _eventSeq = 0;
const nextId = () => `ev_${Date.now()}_${(_eventSeq += 1)}`;

// How long AI playback must be verifiably silent before we trust the mic, to
// cover speaker->mic acoustic latency after the greeting audio ends.
const GATE_DRAIN_PADDING_MS = 900;
// How often to re-check whether AI playback has actually drained. The gate is
// condition-based rather than a single up-front setTimeout: chunks of greeting
// audio keep arriving AFTER turn_complete, so a one-shot timer computed from
// the playhead at turn_complete opened the mic while the AI was still talking —
// the greeting then leaked back in through the speakers and Gemini heard it as
// a student turn, producing a second greeting.
const GATE_POLL_INTERVAL_MS = 120;
// Absolute ceiling so a stalled audio clock can never gate the mic forever.
const GATE_MAX_WAIT_MS = 30000;
// Safety net if `turn_complete` never arrives at all (failed greeting).
const GATE_SAFETY_MS = 30000;
// Last-resort socket close after the server said it was finalizing. Report
// generation is an LLM call, so this must comfortably exceed it.
const FORCE_CLOSE_MS = 60000;

/**
 * Milliseconds of AI speech still scheduled ahead of the audio clock.
 * Pure + exported so the gate-timing math can be unit-tested (bun test).
 */
export function remainingPlaybackMs(playHead: number, currentTime: number): number {
  return Math.max(0, (playHead - currentTime) * 1000);
}

/** Mutable state carried between mic-gate drain checks. */
export interface GateDrainState {
  /** When playback first went quiet, or null if it is (or was) still playing. */
  quietSince: number | null;
}

/**
 * One tick of the mic-gate drain check, as a pure function so the timing rule
 * that gates the student's microphone is directly testable.
 *
 * The rule: the gate opens only after AI playback has been continuously
 * drained for `paddingMs`. Any newly scheduled audio RESETS that window — this
 * is what the old single up-front `setTimeout` could not express, and why the
 * mic used to open while the greeting was still audible.
 */
export function gateDrainTick(
  state: GateDrainState,
  opts: {
    now: number;
    remainingMs: number;
    paused: boolean;
    paddingMs: number;
    /** Absolute time after which we give up waiting and open regardless. */
    deadline: number;
  },
): { open: boolean; state: GateDrainState } {
  const { now, remainingMs, paused, paddingMs, deadline } = opts;
  // While paused the audio clock is frozen; silence then means nothing.
  if (paused) return { open: false, state: { quietSince: null } };
  if (remainingMs > 0) {
    if (now >= deadline) return { open: true, state };
    return { open: false, state: { quietSince: null } };
  }
  const quietSince = state.quietSince ?? now;
  if (now - quietSince >= paddingMs || now >= deadline) {
    return { open: true, state: { quietSince } };
  }
  return { open: false, state: { quietSince } };
}

/** Detect double-opening AI captions (same hello + role + first question restated). */
export function isNearDuplicateOpening(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Both look like openings.
  const openingHint =
    /(hello|namaskar|namaskaram|hi |hey )/.test(na) &&
    /(hello|namaskar|namaskaram|hi |hey )/.test(nb) &&
    /(vivai|examiner|mock viva)/.test(na) &&
    /(vivai|examiner|mock viva)/.test(nb);
  if (!openingHint) return false;
  // Overlap on a meaningful prefix (first ~80 chars of normalized text).
  const pref = 80;
  const pa = na.slice(0, pref);
  const pb = nb.slice(0, pref);
  if (pa.length >= 24 && pb.includes(pa.slice(0, 24))) return true;
  if (pb.length >= 24 && pa.includes(pb.slice(0, 24))) return true;
  // Token Jaccard on short openings
  const ta = new Set(na.split(" ").filter((w) => w.length > 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union > 0 && inter / union >= 0.55;
}

/** Why the live socket closed, and what to tell the student about it. */
export type CloseReason = "superseded" | "session_gone" | "auth" | "network" | "server";

/**
 * Turn a WebSocket close code into an honest explanation.
 *
 * Every non-clean close previously produced one sentence: "The connection closed
 * before the session finished. Please retry." Two things were wrong with that.
 *
 * It hid the cause. The close code is the diagnosis — 4409 means a second
 * connection for this session took over (a reload, a duplicate tab, or a hot
 * reload in development), which is not a failure the student caused and not
 * something retrying in this tab will fix. 1006 is a genuine network drop.
 * Telling all of them to "retry" sends the student in the wrong direction.
 *
 * And it claimed nothing was recorded. The server finalizes on a lost browser
 * socket whenever the student actually spoke (`should_finalize`), so the usual
 * case is that the transcript IS saved and a report exists. Announcing "nothing
 * was recorded" over a session that was in fact graded is the worst kind of
 * wrong: the student re-sits an exam they had already completed.
 */
export function classifyClose(opts: { code: number; hadActivity: boolean }): {
  reason: CloseReason;
  message: string;
} {
  const saved = opts.hadActivity
    ? " What you answered so far was saved — check your reports before re-sitting it."
    : " Nothing was recorded, so this session is not marked as completed.";

  switch (opts.code) {
    case 4409:
      return {
        reason: "superseded",
        message:
          "This session was opened somewhere else — another tab or a page reload took it over. " +
          "Continue in that window rather than here." +
          saved,
      };
    case 4404:
      return {
        reason: "session_gone",
        message: "This session could no longer be found on the server." + saved,
      };
    case 4401:
      return {
        reason: "auth",
        message: "Your sign-in expired during the session. Sign in again to continue." + saved,
      };
    case 1006:
      return {
        reason: "network",
        message: "The connection dropped — this usually means the network went away." + saved,
      };
    default:
      return {
        reason: "server",
        message: "The connection closed before the session finished." + saved,
      };
  }
}

export function useLiveSession(opts: UseLiveSessionOptions) {
  const { mode, sessionId, language = "English", persona = "balanced", projectId, subject } = opts;

  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string>("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [captions, setCaptions] = useState<LiveCaption[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [liveUserText, setLiveUserText] = useState("");
  const [liveAiText, setLiveAiText] = useState("");
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  /**
   * The session was finalized after the connection died rather than after the
   * examiner wrapped up. The report is real — it is just built from a
   * conversation that got cut short, and the student deserves to be told.
   */
  const [endedEarly, setEndedEarly] = useState(false);
  /** True when the browser is blocking AI audio until the user taps again. */
  const [audioBlocked, setAudioBlocked] = useState(false);
  /**
   * The session's length in seconds, as reported by the server on `ready`.
   *
   * Null when no limit is configured. Deliberately not derived from the config
   * the student picked on the setup screen: the server is what enforces the
   * limit, so it is also what defines the countdown. For a long time the chosen
   * duration was stored and then read by nothing, so a "5 minute" viva simply
   * ran until the model felt like stopping.
   */
  const [durationSec, setDurationSec] = useState<number | null>(null);
  /** The limit was reached and the examiner has been asked to close. */
  const [timeUp, setTimeUp] = useState(false);
  /** Student paused the session (mic+playback held; socket stays open). */
  const [paused, setPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playHeadRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const micMutedRef = useRef(false);
  const videoEnabledRef = useRef(true);
  const userBufRef = useRef("");
  const aiBufRef = useRef("");
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedReceivedRef = useRef(false);
  /**
   * Whether the student has actually said anything yet.
   *
   * Mirrors the server's `has_activity`, which decides whether a lost socket
   * still finalizes into a report. Kept in a ref because it is read from the
   * socket's close handler, which closes over the render it was created in.
   */
  const hadActivityRef = useRef(false);
  // The mic is "gated" (not streamed) until the AI finishes its opening
  // greeting. Streaming ambient noise during the greeting makes the Live model
  // treat it as a turn and greet a second time, and can destabilize the socket.
  const micGateOpenRef = useRef(false);
  /** Poller that opens the gate once AI playback has genuinely drained. */
  const gateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Opens the gate unconditionally if `turn_complete` never arrives. */
  const gateSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Last-resort socket close during finalize. Kept SEPARATE from the gate
   * timers: they used to share one ref, so a "finalizing" message could cancel
   * a pending mic-gate open (and vice versa) purely by aliasing.
   */
  const forceCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  /** Mic mute state before pause, restored on resume. */
  const micMutedBeforePauseRef = useRef(false);
  /**
   * Synchronous start lock + generation counter.
   * Root cause of double greetings: `start()` checked `wsRef` only after
   * several `await`s, so two concurrent starts (React Strict Mode remount,
   * double effect, fast double-click) each opened a Live WebSocket and each
   * server sent its own greeting trigger.
   */
  const startInFlightRef = useRef(false);
  const startGenerationRef = useRef(0);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ----------------------- audio playback (24kHz) ----------------------- //
  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // AUDITED: expected. AudioBufferSourceNode.stop() throws
        // InvalidStateError on an already-ended node, which happens on every
        // barge-in. Instrumenting this would flood the report and bury real
        // failures — the exact opposite of the point.
      }
    });
    activeSourcesRef.current = [];
    playHeadRef.current = 0;
  }, []);

  const playChunk = useCallback((pcm: ArrayBuffer) => {
    const ctx = playbackCtxRef.current;
    // Closed/missing context → nothing can play; surface tap-to-unlock so we
    // can recreate under a user gesture (autoplay policy).
    if (!ctx || ctx.state === "closed") {
      if (!pausedRef.current) setAudioBlocked(true);
      return;
    }
    // While intentionally paused we leave the context suspended (currentTime
    // frozen) but STILL schedule chunks so speech continues from the pause
    // point on resume. Only treat suspended as "blocked" when not paused.
    if (ctx.state === "suspended" && !pausedRef.current) {
      setAudioBlocked(true);
      void ctx.resume().then(() => {
        setAudioBlocked(playbackCtxRef.current?.state !== "running");
      });
    } else if (ctx.state === "running") {
      setAudioBlocked(false);
    }
    try {
      // PCM16 is 2 bytes/sample — odd-length buffers throw RangeError on Int16Array.
      const usable = pcm.byteLength - (pcm.byteLength % 2);
      if (usable <= 0) return;
      const int16 = new Int16Array(pcm, 0, usable / 2);
      if (int16.length === 0) return;
      const float = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i += 1) float[i] = int16[i] / 0x8000;
      const buffer = ctx.createBuffer(1, float.length, PLAYBACK_SAMPLE_RATE);
      buffer.copyToChannel(float, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      // When suspended, currentTime is frozen — startAt stays stable so the
      // queue lines up and resumes mid-phrase correctly.
      const now = ctx.currentTime;
      const startAt = Math.max(now, playHeadRef.current);
      src.start(startAt);
      playHeadRef.current = startAt + buffer.duration;
      activeSourcesRef.current.push(src);
      src.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
      };
      if (!pausedRef.current) {
        setAiSpeaking(true);
        if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = setTimeout(
          () => setAiSpeaking(false),
          Math.max(300, (playHeadRef.current - now) * 1000 + 150),
        );
      }
    } catch (e) {
      // Sets audioBlocked, but the CAUSE was lost. A decode/scheduling failure
      // here is heard as "the examiner never spoke".
      captureSilent(e, "play_chunk_failed", { feature: "live" });
      if (!pausedRef.current) setAudioBlocked(true);
    }
  }, []);

  /** Call from a click handler if the browser blocked AI audio. */
  const unlockAudio = useCallback(async () => {
    // Don't fight an intentional session pause (context is suspended on purpose).
    if (pausedRef.current) return;
    let ctx = playbackCtxRef.current;
    try {
      // Recreate if missing/closed (cleanup or autoplay policy killed it).
      if (!ctx || ctx.state === "closed") {
        const PlaybackCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new PlaybackCtx();
        playbackCtxRef.current = ctx;
        playHeadRef.current = 0;
      }
      await ctx.resume();
      // Play a tiny silent buffer to fully unlock some browsers.
      const buf = ctx.createBuffer(1, 1, PLAYBACK_SAMPLE_RATE);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      setAudioBlocked(ctx.state !== "running");
    } catch (e) {
      // The student explicitly tapped "enable AI voice" and it still failed —
      // the one path where we know they noticed and we knew nothing.
      captureSilent(e, "unlock_audio_failed", { feature: "live" });
      setAudioBlocked(true);
    }
  }, []);

  // ----------------------- transcript handling -------------------------- //
  const commitUser = useCallback(() => {
    const text = userBufRef.current.trim();
    if (text) {
      hadActivityRef.current = true;
      setCaptions((c) => [...c, { role: "student", text, ts: Date.now() }]);
    }
    userBufRef.current = "";
    setLiveUserText("");
  }, []);

  const commitAi = useCallback(() => {
    const text = aiBufRef.current.trim();
    aiBufRef.current = "";
    setLiveAiText("");
    if (!text) return;
    setCaptions((c) => {
      // Suppress near-duplicate opening captions (double "Hello… VivAI examiner…").
      const last = [...c].reverse().find((x) => x.role === "examiner");
      if (last && isNearDuplicateOpening(last.text, text)) {
        return c;
      }
      return [...c, { role: "examiner", text, ts: Date.now() }];
    });
  }, []);

  // --------------------------- mic gate --------------------------------- //
  /**
   * Open the gate right now and tell the server it may stop dropping mic audio.
   *
   * The browser is the only side that knows when the greeting actually stopped
   * coming out of the speakers, so it owns this decision; the server's own gate
   * is defense-in-depth for a broken/old client. Previously both sides guessed
   * independently and the server opened at `turn_complete`, seconds early.
   * Idempotent.
   */
  const openGate = useCallback(() => {
    if (micGateOpenRef.current) return;
    micGateOpenRef.current = true;
    if (gateTimerRef.current) {
      clearInterval(gateTimerRef.current);
      gateTimerRef.current = null;
    }
    if (gateSafetyTimerRef.current) {
      clearTimeout(gateSafetyTimerRef.current);
      gateSafetyTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "mic_open" }));
      } catch (e) {
        // Still survivable — the server's 20s safety release opens its gate
        // anyway — but it costs the student 20 seconds of dead air, which is
        // exactly the kind of "it just felt broken" symptom that is impossible
        // to diagnose after the fact.
        captureSilent(e, "mic_open_send_failed", { feature: "live", mode });
      }
    }
  }, [mode]);

  /**
   * Open the mic gate only once the greeting audio has genuinely finished
   * playing — checked by polling the playback clock, not predicted once.
   *
   * `turn_complete` arrives while several seconds of 24kHz greeting are still
   * scheduled in the playback graph, and more chunks can still arrive after it.
   * Computing a single deadline at `turn_complete` therefore opened the mic
   * mid-greeting; the greeting leaked through the speakers (capture and
   * playback use separate AudioContexts, which defeats echo cancellation),
   * Gemini heard it as a student turn, and greeted again. Polling re-arms the
   * acoustic pad every time more audio is scheduled, so that cannot happen.
   */
  const openGateWhenDrained = useCallback(() => {
    if (micGateOpenRef.current || gateTimerRef.current) return;
    const deadline = Date.now() + GATE_MAX_WAIT_MS;
    let state: GateDrainState = { quietSince: null };
    gateTimerRef.current = setInterval(() => {
      const ctx = playbackCtxRef.current;
      const result = gateDrainTick(state, {
        now: Date.now(),
        remainingMs: ctx ? remainingPlaybackMs(playHeadRef.current, ctx.currentTime) : 0,
        paused: pausedRef.current,
        paddingMs: GATE_DRAIN_PADDING_MS,
        deadline,
      });
      state = result.state;
      if (result.open) openGate();
    }, GATE_POLL_INTERVAL_MS);
  }, [openGate]);

  // --------------------------- socket events ---------------------------- //
  const handleMessage = useCallback(
    (raw: MessageEvent) => {
      if (raw.data instanceof ArrayBuffer) {
        playChunk(raw.data);
        return;
      }
      if (raw.data instanceof Blob) {
        raw.data
          .arrayBuffer()
          .then(playChunk)
          // Silently dropping a frame makes the AI intermittently inaudible
          // with no other symptom.
          .catch((e) => captureSilent(e, "audio_blob_read_failed", { feature: "live" }));
        return;
      }
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.data as string);
      } catch (e) {
        // A frame the server sent that we cannot parse is a protocol bug
        // (truncation, encoding), not noise — and it is invisible otherwise.
        captureSilent(e, "ws_frame_parse_failed", { feature: "live" });
        return;
      }
      switch (msg.type) {
        case "ready": {
          setStatus("live");
          // The session's real length, straight from the server that will
          // enforce it. Null means no limit was configured; the UI then shows
          // elapsed time only rather than inventing a deadline.
          const seconds = msg.duration_seconds;
          if (typeof seconds === "number" && seconds > 0) setDurationSec(seconds);
          // Re-assert playback unlock when the socket is live — some browsers
          // re-suspend AudioContext between the Start click and WS ready.
          if (!pausedRef.current) {
            const ctx = playbackCtxRef.current;
            if (!ctx || ctx.state === "closed") {
              setAudioBlocked(true);
            } else if (ctx.state === "suspended") {
              setAudioBlocked(true);
              void ctx.resume().then(() => {
                setAudioBlocked(playbackCtxRef.current?.state !== "running");
              });
            }
          }
          break;
        }
        case "time_up":
          // The server hit the limit and asked the examiner to close. It will end
          // the session itself shortly if that is ignored, so this is purely to
          // explain what the student is about to see.
          setTimeUp(true);
          break;
        case "user_transcript":
          userBufRef.current += String(msg.text ?? "");
          setLiveUserText(userBufRef.current);
          break;
        case "ai_transcript":
          if (userBufRef.current.trim()) commitUser();
          aiBufRef.current += String(msg.text ?? "");
          setLiveAiText(aiBufRef.current);
          // Captions without sound almost always means autoplay blocked the
          // AudioContext — surface the unlock banner immediately.
          if (!pausedRef.current) {
            const ctx = playbackCtxRef.current;
            if (!ctx || ctx.state !== "running") setAudioBlocked(true);
          }
          break;
        case "interrupted":
          stopPlayback();
          setAiSpeaking(false);
          // Barge-in: the model clearly heard the student, so gating is moot —
          // open immediately (playHeadRef was just zeroed by stopPlayback).
          openGate();
          commitAi();
          break;
        case "turn_complete":
          // The AI just finished a turn (the opening greeting on the first one).
          // Open the mic gate only once the greeting audio has actually drained
          // from the playback graph — see openGateWhenDrained.
          openGateWhenDrained();
          commitUser();
          commitAi();
          break;
        case "event": {
          const kind = msg.event as LiveEvent["kind"];
          setEvents((e) => [
            ...e,
            {
              id: nextId(),
              refId: (msg.id as string | null) ?? null,
              kind,
              observationKind: (msg.kind as LiveEvent["observationKind"]) ?? null,
              text: String(msg.text ?? msg.question ?? msg.feedback ?? ""),
              topic: (msg.topic as string | null) ?? null,
              score: (msg.score as number | null) ?? null,
              severity: (msg.severity as string | null) ?? null,
              category: (msg.category as string | null) ?? null,
              dimension: (msg.dimension as string | null) ?? null,
              confidence: (msg.confidence as LiveEvent["confidence"]) ?? null,
              tip: (msg.tip as string | null) ?? null,
              ts: Date.now(),
            },
          ]);
          break;
        }
        case "reconnected":
          // The resumed Gemini connection is live again; the conversation
          // continues where it left off.
          setStatus("live");
          setError("");
          break;
        case "reconnecting":
          // The Gemini connection recycled (it lives ~10 minutes) and the
          // server is transparently resuming the SAME conversation. The socket
          // to us stays open and the transcript is preserved — this is a blip
          // to show, not a failure to recover from.
          setStatus("reconnecting");
          setError("");
          break;
        case "finalizing":
          // The server is starting the expensive part (transcript analysis +
          // report generation). Re-arm the force-close safety net from this
          // point, not from when "end" was first sent, so a slow report is
          // never truncated by time already spent on teardown/flush.
          if (forceCloseTimerRef.current) clearTimeout(forceCloseTimerRef.current);
          forceCloseTimerRef.current = setTimeout(() => {
            try {
              wsRef.current?.close();
            } catch {
              // AUDITED: expected. Closing an already-closed socket. The close
              // is best-effort teardown and nothing downstream depends on it.
            }
            wsRef.current = null;
          }, FORCE_CLOSE_MS);
          break;
        case "ended": {
          endedReceivedRef.current = true;
          const ended = (msg.summary as LiveSummary) ?? null;
          setSummary(ended);
          // The server still produced a real report; it just ran out of
          // connection before the examiner wrapped up on its own.
          setEndedEarly(Boolean(ended?.ended_early));
          setStatus("ended");
          break;
        }
        case "error":
          report(String(msg.message ?? "Live engine error"), {
            kind: "ws_error",
            context: { feature: "live", mode, reason: "server_error_message" },
          });
          setError(String(msg.message ?? "Live engine error"));
          setStatus("error");
          break;
        default:
          break;
      }
    },
    [playChunk, stopPlayback, commitUser, commitAi, openGateWhenDrained, openGate, mode],
  );

  // ------------------------- frame sampling ----------------------------- //
  const sendFrame = useCallback(() => {
    const ws = wsRef.current;
    const video = frameVideoRef.current;
    const canvas = frameCanvasRef.current;
    if (!videoEnabledRef.current) return;
    if (!ws || ws.readyState !== WebSocket.OPEN || !video || !canvas || !video.videoWidth) return;
    if (pausedRef.current || !videoEnabledRef.current) return;
    const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    const base64 = dataUrl.split(",")[1];
    if (base64) ws.send(JSON.stringify({ type: "image", data: base64 }));
  }, []);

  // ------------------------------ start --------------------------------- //
  const start = useCallback(
    async ({ micStream, videoStream, videoSource, playbackAudioContext }: StartOptions) => {
      // Sync guard BEFORE any await — prevents dual WebSockets / dual greetings.
      if (wsRef.current || startInFlightRef.current) return;
      startInFlightRef.current = true;
      const generation = ++startGenerationRef.current;

      const stillCurrent = () => generation === startGenerationRef.current;

      // One trace per live session: everything from here — the preflight
      // handoff, the socket, and every Gemini call the backend makes inside it
      // — shares an id, so the report can show the whole chain as one tree.
      startTrace();
      setStatus("connecting");
      setError("");
      setCaptions([]);
      setEvents([]);
      setSummary(null);
      setEndedEarly(false);
      setAudioBlocked(false);
      videoEnabledRef.current = true;
      setVideoEnabled(true);

      // Keep the mic gated until the AI's opening greeting has actually drained
      // (see openGateWhenDrained). Streaming ambient noise DURING the greeting
      // makes the Live model treat it as a turn and greet a second time. This
      // safety net only fires if `turn_complete` never arrives at all, so it is
      // set well beyond a normal greeting.
      micGateOpenRef.current = false;
      if (gateTimerRef.current) clearInterval(gateTimerRef.current);
      gateTimerRef.current = null;
      if (gateSafetyTimerRef.current) clearTimeout(gateSafetyTimerRef.current);
      gateSafetyTimerRef.current = setTimeout(() => {
        gateSafetyTimerRef.current = null;
        openGate();
      }, GATE_SAFETY_MS);

      const token = getToken();
      if (!token) {
        setError("You are not signed in.");
        setStatus("error");
        startInFlightRef.current = false;
        return;
      }

      // Playback context — prefer the one unlocked under the preflight Start click.
      try {
        if (playbackAudioContext && playbackAudioContext.state !== "closed") {
          playbackCtxRef.current = playbackAudioContext;
        } else {
          const PlaybackCtx =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          playbackCtxRef.current = new PlaybackCtx();
        }
        await playbackCtxRef.current
          .resume()
          // Autoplay policy refusing to resume is the single most common cause
          // of a completely silent session.
          .catch((e) => captureSilent(e, "playback_resume_failed", { feature: "live" }));
        // Warm the output path under the (still recent) user gesture chain.
        try {
          const warm = playbackCtxRef.current.createBuffer(1, 1, PLAYBACK_SAMPLE_RATE);
          const warmSrc = playbackCtxRef.current.createBufferSource();
          warmSrc.buffer = warm;
          warmSrc.connect(playbackCtxRef.current.destination);
          warmSrc.start();
        } catch (e) {
          // Failing to warm the output path usually means autoplay policy is
          // about to silence the whole session.
          captureSilent(e, "playback_warmup_failed", { feature: "live", mode });
        }
        if (!stillCurrent()) {
          startInFlightRef.current = false;
          setStatus("idle");
          return;
        }
        if (playbackCtxRef.current.state !== "running") {
          setAudioBlocked(true);
        }
      } catch (e) {
        // The student sees the message; without this we never learn WHY the
        // browser refused, which is the only actionable part.
        captureSilent(e, "playback_setup_failed", { feature: "live", mode });
        setError("Audio playback is not supported in this browser.");
        setStatus("error");
        startInFlightRef.current = false;
        return;
      }

      // Capture context — prefer a native 16kHz context, else downsample.
      try {
        const CaptureCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        let ctx: AudioContext;
        try {
          ctx = new CaptureCtx({ sampleRate: CAPTURE_SAMPLE_RATE });
        } catch {
          // AUDITED: expected. Feature detection — Firefox rejects a forced
          // sampleRate, so fall back to the default and resample in JS.
          ctx = new CaptureCtx();
        }
        if (!stillCurrent()) {
          void ctx.close().catch(() => {});
          startInFlightRef.current = false;
          setStatus("idle");
          return;
        }
        captureCtxRef.current = ctx;
        const blob = new Blob([RECORDER_WORKLET], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        if (!stillCurrent()) {
          void ctx.close().catch(() => {});
          startInFlightRef.current = false;
          setStatus("idle");
          return;
        }
        const source = ctx.createMediaStreamSource(micStream);
        micSourceRef.current = source;
        const node = new AudioWorkletNode(ctx, "recorder-processor");
        const inRate = ctx.sampleRate;
        node.port.onmessage = (e: MessageEvent) => {
          const ws = wsRef.current;
          // Hold audio until the greeting finishes (gate), while muted, or while paused.
          if (
            !ws ||
            ws.readyState !== WebSocket.OPEN ||
            micMutedRef.current ||
            pausedRef.current ||
            !micGateOpenRef.current
          )
            return;
          const pcm = floatToPCM16(e.data as Float32Array, inRate);
          ws.send(pcm);
        };
        source.connect(node);
        // Keep the node processing without routing mic to speakers.
        const sink = ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink);
        sink.connect(ctx.destination);
        workletNodeRef.current = node;
      } catch (e) {
        // Covers AudioWorklet.addModule, the Blob URL, and getUserMedia wiring —
        // three very different failures behind one identical message.
        captureSilent(e, "mic_processor_setup_failed", { feature: "live", mode });
        setError("Could not access the microphone processor.");
        setStatus("error");
        startInFlightRef.current = false;
        return;
      }

      if (!stillCurrent()) {
        startInFlightRef.current = false;
        setStatus("idle");
        return;
      }

      // Video frame sampler (screen or camera).
      if (videoStream && videoStream.getVideoTracks().length > 0) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.srcObject = videoStream;
        // If this never plays, videoWidth stays 0 and sendFrame silently ships
        // nothing — presentation/coach degrade to audio-only with no error.
        await v
          .play()
          .catch((e) => captureSilent(e, "frame_video_play_failed", { feature: "live" }));
        if (!stillCurrent()) {
          startInFlightRef.current = false;
          setStatus("idle");
          return;
        }
        frameVideoRef.current = v;
        frameCanvasRef.current = document.createElement("canvas");
        frameTimerRef.current = setInterval(sendFrame, FRAME_INTERVAL_MS);
      }

      // Open the socket. Params are built additively; new ones (video, pv) are
      // ignored by older server builds, so this stays backward-compatible.
      const qs = new URLSearchParams({ token, language, persona });
      if (projectId) qs.set("project_id", projectId);
      if (subject && subject.trim()) qs.set("subject", subject.trim());
      const hasVideo = Boolean(videoStream && videoStream.getVideoTracks().length > 0);
      if (hasVideo) qs.set("video", videoSource ?? "1");
      qs.set("pv", "1"); // client protocol version (additive negotiation seam)
      // Trace propagation for the WebSocket leg. The browser WebSocket API
      // cannot set request headers, so the URL is the only channel — this is
      // what ties a Gemini failure deep in the backend back to this session.
      // Dev only, so the production handshake is unchanged.
      if (import.meta.env.DEV) {
        for (const [key, value] of Object.entries(traceQuery())) qs.set(key, value);
      }

      if (!stillCurrent() || wsRef.current) {
        startInFlightRef.current = false;
        if (!wsRef.current) setStatus("idle");
        return;
      }

      const ws = new WebSocket(wsUrl(`/ws/live/${mode}/${sessionId}?${qs.toString()}`));
      ws.binaryType = "arraybuffer";
      // Set immediately so a concurrent start() is rejected.
      wsRef.current = ws;
      startInFlightRef.current = false;
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        // Never pass the socket URL here — it embeds the student's JWT as a
        // query param (see the warning on wsUrl).
        report("live websocket error", {
          kind: "ws_error",
          context: { feature: "live", mode, url_path: `/ws/live/${mode}`, reason: "socket_error" },
        });
        setError("Connection error. The live AI engine may be busy — please retry.");
        setStatus("error");
      };
      ws.onclose = (event) => {
        // Only treat a close as a clean end if the server actually sent the
        // final "ended" summary. A silent close means something failed —
        // never fabricate a completed 0% session out of it.
        if (wsRef.current === ws) wsRef.current = null;
        setStatus((s) => {
          if (s === "ended" || s === "error") return s;
          if (endedReceivedRef.current) return "ended";
          const outcome = classifyClose({
            code: event.code,
            hadActivity: hadActivityRef.current,
          });
          // This close used to be completely unreported: `onerror` captured an
          // event but `onclose` did not, so the single most common way a session
          // dies left nothing on disk at all — no code, no reason, nothing to
          // diagnose afterwards. The close code is the whole diagnosis here: it
          // separates a superseded connection from a dropped network from a
          // server that gave up.
          report(`live socket closed: ${outcome.reason}`, {
            kind: "ws_error",
            level: outcome.reason === "superseded" ? "WARNING" : "ERROR",
            context: {
              feature: "live",
              mode,
              url_path: `/ws/live/${mode}`,
              ws_code: event.code,
              reason: outcome.reason,
              has_activity: hadActivityRef.current,
            },
          });
          setError((prev) => prev || outcome.message);
          return "error";
        });
      };
    },
    [mode, sessionId, language, persona, projectId, subject, handleMessage, sendFrame, openGate],
  );

  // ------------------------------ stop ---------------------------------- //
  const cleanup = useCallback(() => {
    // Invalidate any in-flight start() so a remount cannot finish opening a 2nd socket.
    startGenerationRef.current += 1;
    startInFlightRef.current = false;
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    frameTimerRef.current = null;
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    if (gateTimerRef.current) {
      clearInterval(gateTimerRef.current);
      gateTimerRef.current = null;
    }
    if (gateSafetyTimerRef.current) {
      clearTimeout(gateSafetyTimerRef.current);
      gateSafetyTimerRef.current = null;
    }
    micGateOpenRef.current = false;
    stopPlayback();
    try {
      workletNodeRef.current?.disconnect();
      micSourceRef.current?.disconnect();
    } catch (e) {
      // A failure here leaks the mic node, and the browser keeps showing the
      // recording indicator — visible to the user, invisible to us.
      captureSilent(e, "media_teardown_failed", { feature: "live", mode });
    }
    workletNodeRef.current = null;
    micSourceRef.current = null;
    captureCtxRef.current
      ?.close()
      .catch((e) => captureSilent(e, "capture_ctx_close_failed", { feature: "live" }));
    captureCtxRef.current = null;
    // Do not close playbackAudioContext handed from preflight if caller still owns it —
    // still safe to close here for session teardown; preflight already transferred ownership.
    playbackCtxRef.current
      ?.close()
      .catch((e) => captureSilent(e, "playback_ctx_close_failed", { feature: "live" }));
    playbackCtxRef.current = null;
    if (frameVideoRef.current) {
      frameVideoRef.current.srcObject = null;
      frameVideoRef.current = null;
    }
  }, [stopPlayback, mode]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "end" }));
      } catch (e) {
        // If this send is lost the server never learns the session ended, so
        // it never finalizes and the student never gets a report. Silence here
        // is precisely the "my session vanished" failure.
        captureSilent(e, "end_send_failed", { feature: "live", mode });
      }
    }
    // Tear down capture/playback media immediately (student is done talking)…
    cleanup();
    // …but KEEP the socket open and listening so we still receive the server's
    // final {"ended", summary} message. Building the report (transcript
    // analysis) can take several seconds; the server closes the socket itself
    // once it's done. Only force-close as a last-resort safety net well beyond
    // the expected finalize time, so we never truncate the report.
    if (forceCloseTimerRef.current) clearTimeout(forceCloseTimerRef.current);
    forceCloseTimerRef.current = setTimeout(() => {
      try {
        ws?.close();
      } catch {
        // AUDITED: expected. Closing an already-closed socket. The close is
        // best-effort teardown and nothing downstream depends on it.
      }
      wsRef.current = null;
    }, FORCE_CLOSE_MS);
  }, [cleanup, mode]);

  const toggleMic = useCallback(() => {
    // While paused, mic is forced silent — don't fight the pause state.
    if (pausedRef.current) return;
    setMicMuted((m) => !m);
  }, []);

  /** Pause/resume the camera mid-session — disables the actual video track
   * (not just the frame-capture timer), so the local preview and the
   * frames sent to the model go dark together, from one source of truth. */
  const toggleVideo = useCallback(() => {
    setVideoEnabled((prev) => {
      const next = !prev;
      videoEnabledRef.current = next;
      const stream = frameVideoRef.current?.srcObject as MediaStream | null | undefined;
      stream?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  /**
   * Pause without ending the session.
   * Freezes the AudioContext so AI speech that was mid-sentence continues
   * from the same point on resume (do NOT stopPlayback — that discards audio).
   * Mic stays off while paused; WebSocket stays open.
   */
  const pause = useCallback(() => {
    if (pausedRef.current) return;
    micMutedBeforePauseRef.current = micMutedRef.current;
    pausedRef.current = true;
    setPaused(true);
    setMicMuted(true);
    setAiSpeaking(false);
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    const ctx = playbackCtxRef.current;
    if (ctx && ctx.state === "running") {
      // A failed suspend means "Paused" is a lie — audio keeps playing.
      void ctx
        .suspend()
        .catch((e) => captureSilent(e, "pause_suspend_failed", { feature: "live" }));
    }
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    setMicMuted(micMutedBeforePauseRef.current);
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    void ctx
      .resume()
      .then(() => {
        setAudioBlocked(ctx.state !== "running");
        // If audio is still scheduled ahead of the clock, show "AI speaking".
        const remaining = remainingPlaybackMs(playHeadRef.current, ctx.currentTime);
        if (remaining > 50) {
          setAiSpeaking(true);
          if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
          speakingTimerRef.current = setTimeout(() => setAiSpeaking(false), remaining + 150);
        }
      })
      .catch(() => setAudioBlocked(true));
  }, []);

  const togglePause = useCallback(() => {
    if (pausedRef.current) resume();
    else pause();
  }, [pause, resume]);

  /** Fully reset the hook so the session can be retried from pre-flight. */
  const reset = useCallback(() => {
    cleanup();
    if (forceCloseTimerRef.current) {
      clearTimeout(forceCloseTimerRef.current);
      forceCloseTimerRef.current = null;
    }
    try {
      wsRef.current?.close();
    } catch {
      // AUDITED: expected. Closing an already-closed socket during teardown.
    }
    wsRef.current = null;
    endedReceivedRef.current = false;
    setStatus("idle");
    setError("");
    setCaptions([]);
    setEvents([]);
    setLiveUserText("");
    setLiveAiText("");
    setSummary(null);
    setEndedEarly(false);
    setMicMuted(false);
    setAudioBlocked(false);
    setPaused(false);
    setDurationSec(null);
    setTimeUp(false);
    pausedRef.current = false;
    hadActivityRef.current = false;
  }, [cleanup]);

  const pushText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && text.trim()) {
      ws.send(JSON.stringify({ type: "text", text }));
      setCaptions((c) => [...c, { role: "student", text, ts: Date.now() }]);
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (forceCloseTimerRef.current) {
        clearTimeout(forceCloseTimerRef.current);
        forceCloseTimerRef.current = null;
      }
      try {
        wsRef.current?.close();
      } catch {
        // AUDITED: expected. Closing an already-closed socket. The close is
        // best-effort teardown and nothing downstream depends on it.
      }
      wsRef.current = null;
    };
  }, [cleanup]);

  return {
    status,
    error,
    aiSpeaking,
    micMuted,
    videoEnabled,
    captions,
    events,
    liveUserText,
    liveAiText,
    summary,
    endedEarly,
    audioBlocked,
    paused,
    durationSec,
    timeUp,
    start,
    stop,
    reset,
    toggleMic,
    toggleVideo,
    togglePause,
    pause,
    resume,
    pushText,
    unlockAudio,
  };
}
