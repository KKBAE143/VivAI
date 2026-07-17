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

// Padding added on top of the remaining playback time before opening the mic
// gate, to cover speaker->mic acoustic latency after the greeting audio ends.
const GATE_DRAIN_PADDING_MS = 350;

/**
 * Milliseconds of AI speech still scheduled ahead of the audio clock.
 * Pure + exported so the gate-timing math can be unit-tested (bun test).
 */
export function remainingPlaybackMs(playHead: number, currentTime: number): number {
  return Math.max(0, (playHead - currentTime) * 1000);
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
  /** True when the browser is blocking AI audio until the user taps again. */
  const [audioBlocked, setAudioBlocked] = useState(false);
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
  // The mic is "gated" (not streamed) until the AI finishes its opening
  // greeting. Streaming ambient noise during the greeting makes the Live model
  // treat it as a turn and greet a second time, and can destabilize the socket.
  const micGateOpenRef = useRef(false);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  /** Mic mute state before pause, restored on resume. */
  const micMutedBeforePauseRef = useRef(false);

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
        /* already stopped */
      }
    });
    activeSourcesRef.current = [];
    playHeadRef.current = 0;
  }, []);

  const playChunk = useCallback((pcm: ArrayBuffer) => {
    // Drop AI audio while paused so we don't queue speech for later.
    if (pausedRef.current) return;
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    // Autoplay policy: if still suspended, try resume; surface a tap-to-unlock UI.
    if (ctx.state === "suspended") {
      setAudioBlocked(true);
      void ctx.resume().then(() => {
        setAudioBlocked(playbackCtxRef.current?.state !== "running");
      });
    } else if (ctx.state === "running") {
      setAudioBlocked(false);
    }
    const int16 = new Int16Array(pcm);
    if (int16.length === 0) return;
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) float[i] = int16[i] / 0x8000;
    const buffer = ctx.createBuffer(1, float.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const startAt = Math.max(now, playHeadRef.current);
    try {
      src.start(startAt);
    } catch {
      setAudioBlocked(true);
      return;
    }
    playHeadRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(src);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
    };
    setAiSpeaking(true);
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    speakingTimerRef.current = setTimeout(
      () => setAiSpeaking(false),
      Math.max(300, (playHeadRef.current - now) * 1000 + 150),
    );
  }, []);

  /** Call from a click handler if the browser blocked AI audio. */
  const unlockAudio = useCallback(async () => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    try {
      await ctx.resume();
      // Play a tiny silent buffer to fully unlock some browsers.
      const buf = ctx.createBuffer(1, 1, PLAYBACK_SAMPLE_RATE);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      setAudioBlocked(ctx.state !== "running");
    } catch {
      setAudioBlocked(true);
    }
  }, []);

  // ----------------------- transcript handling -------------------------- //
  const commitUser = useCallback(() => {
    const text = userBufRef.current.trim();
    if (text) setCaptions((c) => [...c, { role: "student", text, ts: Date.now() }]);
    userBufRef.current = "";
    setLiveUserText("");
  }, []);

  const commitAi = useCallback(() => {
    const text = aiBufRef.current.trim();
    if (text) setCaptions((c) => [...c, { role: "examiner", text, ts: Date.now() }]);
    aiBufRef.current = "";
    setLiveAiText("");
  }, []);

  // --------------------------- mic gate --------------------------------- //
  /**
   * Open the mic gate only AFTER the greeting audio has finished playing.
   * `turn_complete` arrives while several seconds of 24kHz greeting are still
   * scheduled in the playback graph; opening the gate immediately streams that
   * greeting (leaking through the speakers, since capture/playback use separate
   * AudioContexts that defeat echo cancellation) back to Gemini, which then
   * greets again. We instead wait out the remaining scheduled playback plus a
   * small acoustic-latency pad, then open. Idempotent.
   */
  const openGateWhenDrained = useCallback(() => {
    if (micGateOpenRef.current) return;
    const ctx = playbackCtxRef.current;
    const remaining = ctx ? remainingPlaybackMs(playHeadRef.current, ctx.currentTime) : 0;
    if (gateTimerRef.current) clearTimeout(gateTimerRef.current);
    gateTimerRef.current = setTimeout(() => {
      micGateOpenRef.current = true;
      gateTimerRef.current = null;
    }, remaining + GATE_DRAIN_PADDING_MS);
  }, []);

  /** Open the gate right now (used on barge-in — the model already heard us). */
  const openGateNow = useCallback(() => {
    if (micGateOpenRef.current) return;
    micGateOpenRef.current = true;
    if (gateTimerRef.current) {
      clearTimeout(gateTimerRef.current);
      gateTimerRef.current = null;
    }
  }, []);

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
          .catch(() => {});
        return;
      }
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.data as string);
      } catch {
        return;
      }
      switch (msg.type) {
        case "ready":
          setStatus("live");
          break;
        case "user_transcript":
          userBufRef.current += String(msg.text ?? "");
          setLiveUserText(userBufRef.current);
          break;
        case "ai_transcript":
          if (userBufRef.current.trim()) commitUser();
          aiBufRef.current += String(msg.text ?? "");
          setLiveAiText(aiBufRef.current);
          break;
        case "interrupted":
          stopPlayback();
          setAiSpeaking(false);
          // Barge-in: the model clearly heard the student, so gating is moot —
          // open immediately (playHeadRef was just zeroed by stopPlayback).
          openGateNow();
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
        case "finalizing":
          // The server is starting the expensive part (transcript analysis +
          // report generation). Re-arm the force-close safety net from this
          // point, not from when "end" was first sent, so a slow report is
          // never truncated by time already spent on teardown/flush.
          if (gateTimerRef.current) clearTimeout(gateTimerRef.current);
          gateTimerRef.current = setTimeout(() => {
            try {
              wsRef.current?.close();
            } catch {
              /* noop */
            }
            wsRef.current = null;
          }, 60000);
          break;
        case "ended":
          endedReceivedRef.current = true;
          setSummary((msg.summary as LiveSummary) ?? null);
          setStatus("ended");
          break;
        case "error":
          setError(String(msg.message ?? "Live engine error"));
          setStatus("error");
          break;
        default:
          break;
      }
    },
    [playChunk, stopPlayback, commitUser, commitAi, openGateWhenDrained, openGateNow],
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
      if (wsRef.current) return;
      setStatus("connecting");
      setError("");
      setCaptions([]);
      setEvents([]);
      setSummary(null);
      setAudioBlocked(false);
      videoEnabledRef.current = true;
      setVideoEnabled(true);

      // Keep the mic gated until the AI's opening greeting completes (we open it
      // on the first `turn_complete`). Streaming ambient noise DURING the
      // greeting makes the Live model treat it as a turn and greet a second
      // time. The safety net below only fires if `turn_complete` never arrives,
      // so it's set well beyond a normal greeting to avoid opening mid-greeting.
      micGateOpenRef.current = false;
      if (gateTimerRef.current) clearTimeout(gateTimerRef.current);
      gateTimerRef.current = setTimeout(() => {
        micGateOpenRef.current = true;
      }, 30000);

      const token = getToken();
      if (!token) {
        setError("You are not signed in.");
        setStatus("error");
        return;
      }

      // Playback context — prefer the one unlocked under the preflight Start click.
      try {
        if (playbackAudioContext) {
          playbackCtxRef.current = playbackAudioContext;
          await playbackCtxRef.current.resume().catch(() => {});
        } else {
          const PlaybackCtx =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          playbackCtxRef.current = new PlaybackCtx();
          await playbackCtxRef.current.resume().catch(() => {});
        }
        if (playbackCtxRef.current.state === "suspended") {
          setAudioBlocked(true);
        }
      } catch {
        setError("Audio playback is not supported in this browser.");
        setStatus("error");
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
          ctx = new CaptureCtx();
        }
        captureCtxRef.current = ctx;
        const blob = new Blob([RECORDER_WORKLET], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
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
      } catch {
        setError("Could not access the microphone processor.");
        setStatus("error");
        return;
      }

      // Video frame sampler (screen or camera).
      if (videoStream && videoStream.getVideoTracks().length > 0) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.srcObject = videoStream;
        await v.play().catch(() => {});
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
      const ws = new WebSocket(wsUrl(`/ws/live/${mode}/${sessionId}?${qs.toString()}`));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        setError("Connection error. The live AI engine may be busy — please retry.");
        setStatus("error");
      };
      ws.onclose = () => {
        // Only treat a close as a clean end if the server actually sent the
        // final "ended" summary. A silent close means something failed —
        // never fabricate a completed 0% session out of it.
        setStatus((s) => {
          if (s === "ended" || s === "error") return s;
          if (endedReceivedRef.current) return "ended";
          setError(
            (prev) => prev || "The connection closed before the session finished. Please retry.",
          );
          return "error";
        });
      };
    },
    [mode, sessionId, language, persona, projectId, subject, handleMessage, sendFrame],
  );

  // ------------------------------ stop ---------------------------------- //
  const cleanup = useCallback(() => {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    frameTimerRef.current = null;
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    if (gateTimerRef.current) {
      clearTimeout(gateTimerRef.current);
      gateTimerRef.current = null;
    }
    micGateOpenRef.current = false;
    stopPlayback();
    try {
      workletNodeRef.current?.disconnect();
      micSourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    workletNodeRef.current = null;
    micSourceRef.current = null;
    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    if (frameVideoRef.current) {
      frameVideoRef.current.srcObject = null;
      frameVideoRef.current = null;
    }
  }, [stopPlayback]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "end" }));
      } catch {
        /* noop */
      }
    }
    // Tear down capture/playback media immediately (student is done talking)…
    cleanup();
    // …but KEEP the socket open and listening so we still receive the server's
    // final {"ended", summary} message. Building the report (transcript
    // analysis) can take several seconds; the server closes the socket itself
    // once it's done. Only force-close as a last-resort safety net well beyond
    // the expected finalize time, so we never truncate the report.
    if (gateTimerRef.current) clearTimeout(gateTimerRef.current);
    gateTimerRef.current = setTimeout(() => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }, 60000); // 60s: report generation (an LLM call) can take a while; the
    // server closes the socket itself once finalize() is done. Bumped from 30s
    // so a slower evidence-based report is never truncated (WS3 / R6).
  }, [cleanup]);

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
   * Pause the live session without ending it:
   * - stops AI playback
   * - stops sending mic audio
   * - keeps the WebSocket open so Resume continues the same session
   */
  const pause = useCallback(() => {
    if (pausedRef.current) return;
    micMutedBeforePauseRef.current = micMutedRef.current;
    pausedRef.current = true;
    setPaused(true);
    setMicMuted(true);
    stopPlayback();
    setAiSpeaking(false);
  }, [stopPlayback]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    setMicMuted(micMutedBeforePauseRef.current);
    // Re-unlock playback in case the browser suspended the context while idle.
    void playbackCtxRef.current?.resume().catch(() => {});
  }, []);

  const togglePause = useCallback(() => {
    if (pausedRef.current) resume();
    else pause();
  }, [pause, resume]);

  /** Fully reset the hook so the session can be retried from pre-flight. */
  const reset = useCallback(() => {
    cleanup();
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
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
    setMicMuted(false);
    setAudioBlocked(false);
    setPaused(false);
    pausedRef.current = false;
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
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
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
    audioBlocked,
    paused,
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
