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
export type LiveMode = "viva" | "presentation" | "pitch";

export interface LiveCaption {
  role: "student" | "examiner";
  text: string;
  ts: number;
}

export interface LiveEvent {
  id: string;
  kind: "flag" | "question" | "score";
  text: string;
  topic?: string | null;
  score?: number | null;
  severity?: string | null;
  ts: number;
}

export interface LiveSummary {
  overall_score?: number;
  questions?: unknown[];
  flags?: unknown[];
  transcript?: unknown[];
}

export interface StartOptions {
  micStream: MediaStream;
  /** Optional screen/camera stream sampled at ~1fps and sent to the model. */
  videoStream?: MediaStream | null;
}

export interface UseLiveSessionOptions {
  mode: LiveMode;
  sessionId: string;
  language?: string;
  persona?: string;
  projectId?: string | null;
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

export function useLiveSession(opts: UseLiveSessionOptions) {
  const { mode, sessionId, language = "English", persona = "balanced", projectId } = opts;

  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string>("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [captions, setCaptions] = useState<LiveCaption[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [liveUserText, setLiveUserText] = useState("");
  const [liveAiText, setLiveAiText] = useState("");
  const [summary, setSummary] = useState<LiveSummary | null>(null);

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
  const userBufRef = useRef("");
  const aiBufRef = useRef("");
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

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
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
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
    src.start(startAt);
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

  // --------------------------- socket events ---------------------------- //
  const handleMessage = useCallback(
    (raw: MessageEvent) => {
      if (raw.data instanceof ArrayBuffer) {
        playChunk(raw.data);
        return;
      }
      if (raw.data instanceof Blob) {
        raw.data.arrayBuffer().then(playChunk).catch(() => {});
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
          commitAi();
          break;
        case "turn_complete":
          commitUser();
          commitAi();
          break;
        case "event": {
          const kind = msg.event as LiveEvent["kind"];
          setEvents((e) => [
            ...e,
            {
              id: nextId(),
              kind,
              text: String(msg.text ?? msg.question ?? msg.feedback ?? ""),
              topic: (msg.topic as string | null) ?? null,
              score: (msg.score as number | null) ?? null,
              severity: (msg.severity as string | null) ?? null,
              ts: Date.now(),
            },
          ]);
          break;
        }
        case "ended":
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
    [playChunk, stopPlayback, commitUser, commitAi],
  );

  // ------------------------- frame sampling ----------------------------- //
  const sendFrame = useCallback(() => {
    const ws = wsRef.current;
    const video = frameVideoRef.current;
    const canvas = frameCanvasRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !video || !canvas || !video.videoWidth) return;
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
    async ({ micStream, videoStream }: StartOptions) => {
      if (wsRef.current) return;
      setStatus("connecting");
      setError("");
      setCaptions([]);
      setEvents([]);
      setSummary(null);

      const token = getToken();
      if (!token) {
        setError("You are not signed in.");
        setStatus("error");
        return;
      }

      // Playback context (resampled from 24kHz buffers).
      try {
        const PlaybackCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        playbackCtxRef.current = new PlaybackCtx();
        await playbackCtxRef.current.resume().catch(() => {});
      } catch {
        setError("Audio playback is not supported in this browser.");
        setStatus("error");
        return;
      }

      // Capture context — prefer a native 16kHz context, else downsample.
      try {
        const CaptureCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
          if (!ws || ws.readyState !== WebSocket.OPEN || micMutedRef.current) return;
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

      // Open the socket.
      const qs = new URLSearchParams({ token, language, persona });
      if (projectId) qs.set("project_id", projectId);
      const ws = new WebSocket(wsUrl(`/ws/live/${mode}/${sessionId}?${qs.toString()}`));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        setError("Connection error. The live AI engine may be busy — please retry.");
        setStatus("error");
      };
      ws.onclose = () => {
        setStatus((s) => (s === "ended" || s === "error" ? s : "ended"));
      };
    },
    [mode, sessionId, language, persona, projectId, handleMessage, sendFrame],
  );

  // ------------------------------ stop ---------------------------------- //
  const cleanup = useCallback(() => {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    frameTimerRef.current = null;
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
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
    cleanup();
    // Keep the socket briefly so the server can send the final summary.
    setTimeout(() => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }, 1500);
  }, [cleanup]);

  const toggleMic = useCallback(() => setMicMuted((m) => !m), []);

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
    captions,
    events,
    liveUserText,
    liveAiText,
    summary,
    start,
    stop,
    toggleMic,
    pushText,
  };
}
