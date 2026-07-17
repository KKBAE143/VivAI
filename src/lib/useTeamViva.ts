/**
 * useTeamViva — client side of the voice, multi-participant Team Viva room.
 *
 * Same PCM16-capture / PCM24-playback plumbing as useLiveSession.ts (copied,
 * not imported, so the solo live modes are never touched by this feature),
 * but gated differently: instead of one gate that opens once after the
 * greeting, mic frames are only ever sent while THIS client currently holds
 * the floor (`floorSpeakerId === myProfileId`), as granted by the server's
 * `{"type":"floor", speaker_id}` broadcasts. The server drops anything sent
 * out of turn too — this is just the cheap client-side half of that gate, so
 * bandwidth isn't wasted streaming audio nobody will use.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, wsUrl } from "@/lib/api";

export type TeamVivaStatus = "idle" | "connecting" | "lobby" | "live" | "ended" | "error";

export interface TeamVivaMember {
  profile_id: string;
  name: string;
}

export interface TeamVivaEvent {
  id: string;
  kind: "question" | "score";
  speakerId: string | null;
  text: string;
  topic?: string | null;
  score?: number | null;
  ts: number;
}

export interface TeamVivaSummary {
  team_score?: number;
  members?: { profile_id: string; name: string; individual_score: number; questions_answered: number }[];
  questions?: unknown[];
}

export interface UseTeamVivaOptions {
  sessionId: string;
  myProfileId: string;
  language?: string;
  persona?: string;
}

const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_SAMPLE_RATE = 16000;

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

let _seq = 0;
const nextId = () => `tv_${Date.now()}_${(_seq += 1)}`;

export function useTeamViva(opts: UseTeamVivaOptions) {
  const { sessionId, myProfileId, language = "English", persona = "balanced" } = opts;

  const [status, setStatus] = useState<TeamVivaStatus>("idle");
  const [error, setError] = useState("");
  const [members, setMembers] = useState<TeamVivaMember[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<"muted" | "live">("muted");
  const [floorSpeakerId, setFloorSpeakerId] = useState<string | null>(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [events, setEvents] = useState<TeamVivaEvent[]>([]);
  const [summary, setSummary] = useState<TeamVivaSummary | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playHeadRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const floorRef = useRef<string | null>(null);
  const micMutedRef = useRef(false);
  const endedReceivedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    floorRef.current = floorSpeakerId;
  }, [floorSpeakerId]);
  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

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
  }, []);

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
        case "lobby":
          setMembers((msg.members as TeamVivaMember[]) ?? []);
          setLeadId((msg.lead_id as string) ?? null);
          setAiStatus((msg.ai_status as "muted" | "live") ?? "muted");
          setStatus((s) => (s === "idle" || s === "connecting" ? "lobby" : s));
          break;
        case "floor":
          setFloorSpeakerId((msg.speaker_id as string | null) ?? null);
          setAiSpeaking(Boolean(msg.ai_speaking));
          setStatus("live");
          break;
        case "interrupted":
          stopPlayback();
          setAiSpeaking(false);
          break;
        case "event": {
          const evt = msg.event as string;
          if (evt !== "question" && evt !== "score") break;
          setEvents((e) => [
            ...e,
            {
              id: nextId(),
              kind: evt as "question" | "score",
              speakerId: (msg.speaker_id as string | null) ?? null,
              text: String(msg.question ?? msg.feedback ?? ""),
              topic: (msg.topic as string | null) ?? null,
              score: (msg.score as number | null) ?? null,
              ts: Date.now(),
            },
          ]);
          break;
        }
        case "ended":
          endedReceivedRef.current = true;
          setSummary((msg.summary as TeamVivaSummary) ?? null);
          setStatus("ended");
          break;
        case "error":
          setError(String(msg.message ?? "Team viva error"));
          setStatus((s) => (s === "live" ? s : "error"));
          break;
        default:
          break;
      }
    },
    [playChunk, stopPlayback],
  );

  const cleanupMedia = useCallback(() => {
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
  }, [stopPlayback]);

  const join = useCallback(
    async (micStream: MediaStream) => {
      if (wsRef.current) return;
      setStatus("connecting");
      setError("");
      setEvents([]);
      setSummary(null);

      const token = getToken();
      if (!token) {
        setError("You are not signed in.");
        setStatus("error");
        return;
      }

      try {
        const PlaybackCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        playbackCtxRef.current = new PlaybackCtx();
        await playbackCtxRef.current.resume().catch(() => {});
      } catch {
        setError("Audio playback is not supported in this browser.");
        setStatus("error");
        return;
      }

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
          if (!ws || ws.readyState !== WebSocket.OPEN || micMutedRef.current || floorRef.current !== myProfileId) return;
          const pcm = floatToPCM16(e.data as Float32Array, inRate);
          ws.send(pcm);
        };
        source.connect(node);
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

      const qs = new URLSearchParams({ token, language, persona });
      const ws = new WebSocket(wsUrl(`/ws/team-viva/${sessionId}?${qs.toString()}`));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        setError("Connection error.");
        setStatus("error");
      };
      ws.onclose = () => {
        setStatus((s) => {
          if (s === "ended" || s === "error") return s;
          if (endedReceivedRef.current) return "ended";
          setError((prev) => prev || "The connection closed unexpectedly.");
          return "error";
        });
      };
    },
    [sessionId, myProfileId, language, persona, handleMessage],
  );

  const startViva = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "start" }));
  }, []);

  /** Lead-only: ends the viva for the whole room. Tears down local media
   * immediately but keeps the socket open to receive the final {"ended",
   * summary} once the server finishes grading — same pattern as the solo
   * live session's stop(). */
  const endViva = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "end" }));
      } catch {
        /* noop */
      }
    }
    cleanupMedia();
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }, 60000);
  }, [cleanupMedia]);

  /** Any participant leaving the lobby/room without ending it for everyone. */
  const leave = useCallback(() => {
    cleanupMedia();
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    wsRef.current = null;
  }, [cleanupMedia]);

  const toggleMic = useCallback(() => setMicMuted((m) => !m), []);

  useEffect(() => () => leave(), [leave]);

  return {
    status,
    error,
    members,
    leadId,
    aiStatus,
    floorSpeakerId,
    aiSpeaking,
    micMuted,
    events,
    summary,
    isMyFloor: floorSpeakerId === myProfileId,
    join,
    startViva,
    endViva,
    leave,
    toggleMic,
  };
}
