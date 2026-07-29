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
import { decodeFrame, KIND_HUMAN } from "@/lib/audio-frames";
import { captureSilent, report } from "@/diagnostics/client";
import { startTrace, traceQuery } from "@/diagnostics/trace";

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
  members?: {
    profile_id: string;
    name: string;
    individual_score: number;
    questions_answered: number;
  }[];
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
  /** True when the browser is blocking AI audio until the user taps again. */
  const [audioBlocked, setAudioBlocked] = useState(false);
  /** Faculty watching this viva. Never examined, never hold a student slot. */
  const [observers, setObservers] = useState<TeamVivaMember[]>([]);
  /** Whether a faculty member has paused the examiner to take over. */
  const [aiPaused, setAiPaused] = useState(false);
  /** Who paused it, for the banner the room shows everyone. */
  const [pausedBy, setPausedBy] = useState<string | null>(null);

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
        // AUDITED: expected. AudioBufferSourceNode.stop() throws
        // InvalidStateError on an already-ended node, which happens on every
        // barge-in. Instrumenting this would flood the report and bury real
        // failures — the exact opposite of the point.
      }
    });
    activeSourcesRef.current = [];
    playHeadRef.current = 0;
  }, []);

  const playChunk = useCallback((pcm: ArrayBuffer, sampleRate = PLAYBACK_SAMPLE_RATE) => {
    const ctx = playbackCtxRef.current;
    // A missing/closed context means nothing can play. Surface tap-to-unlock
    // instead of silently discarding the examiner's speech — this hook had no
    // recovery path at all, so an autoplay-suspended context left the whole
    // team staring at scrolling transcripts in total silence.
    if (!ctx || ctx.state === "closed") {
      setAudioBlocked(true);
      return;
    }
    if (ctx.state === "suspended") {
      setAudioBlocked(true);
      void ctx.resume().then(() => {
        setAudioBlocked(playbackCtxRef.current?.state !== "running");
      });
    } else {
      setAudioBlocked(false);
    }
    try {
      // PCM16 is 2 bytes/sample — an odd-length buffer makes the Int16Array
      // constructor throw RangeError, which used to escape straight out of the
      // WebSocket onmessage handler.
      const usable = pcm.byteLength - (pcm.byteLength % 2);
      if (usable <= 0) return;
      const int16 = new Int16Array(pcm, 0, usable / 2);
      if (int16.length === 0) return;
      const float = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i += 1) float[i] = int16[i] / 0x8000;
      // Rate comes from the frame: AI speech is 24kHz, a relayed human mic is
      // 16kHz, and playing one at the other's rate is audibly wrong.
      const buffer = ctx.createBuffer(1, float.length, sampleRate);
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
    } catch (e) {
      // Sets audioBlocked, but the CAUSE was lost. A decode/scheduling failure
      // here is heard by the whole room as "the examiner never spoke".
      captureSilent(e, "play_chunk_failed", { feature: "team_viva", mode: "team_viva" });
      setAudioBlocked(true);
    }
  }, []);

  /**
   * Route one inbound binary frame to playback.
   *
   * A tagged frame carries its own sample rate and speaker; an untagged one is
   * a server that predates tagging, and is still plain 24kHz AI speech. Own
   * audio is never echoed back — the server already skips the sender, and this
   * is a second guard so a future relay change cannot make people hear
   * themselves on a delay.
   */
  const playAudioBuffer = useCallback(
    (buffer: ArrayBuffer) => {
      const frame = decodeFrame(buffer);
      if (!frame) {
        playChunk(buffer);
        return;
      }
      if (frame.kind === KIND_HUMAN && frame.speakerId === myProfileId) return;
      playChunk(frame.payload, frame.sampleRate);
    },
    [playChunk, myProfileId],
  );

  /** Call from a click handler if the browser blocked AI audio. */
  const unlockAudio = useCallback(async () => {
    let ctx = playbackCtxRef.current;
    try {
      if (!ctx || ctx.state === "closed") {
        const PlaybackCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new PlaybackCtx();
        playbackCtxRef.current = ctx;
        playHeadRef.current = 0;
      }
      await ctx.resume();
      // A tiny silent buffer fully unlocks some browsers.
      const buf = ctx.createBuffer(1, 1, PLAYBACK_SAMPLE_RATE);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      setAudioBlocked(ctx.state !== "running");
    } catch (e) {
      // A participant explicitly tapped "enable the examiner's voice" and it
      // still failed — the one path where we know they noticed.
      captureSilent(e, "unlock_audio_failed", { feature: "team_viva", mode: "team_viva" });
      setAudioBlocked(true);
    }
  }, []);

  const handleMessage = useCallback(
    (raw: MessageEvent) => {
      if (raw.data instanceof ArrayBuffer) {
        playAudioBuffer(raw.data);
        return;
      }
      if (raw.data instanceof Blob) {
        raw.data
          .arrayBuffer()
          .then(playAudioBuffer)
          // Dropping a frame makes the AI intermittently inaudible to everyone.
          .catch((e) =>
            captureSilent(e, "audio_blob_read_failed", { feature: "team_viva", mode: "team_viva" }),
          );
        return;
      }
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.data as string);
      } catch (e) {
        // An unparseable frame is a protocol bug, not noise — and floor-control
        // state rides on these frames, so a dropped one can strand a speaker.
        captureSilent(e, "ws_frame_parse_failed", { feature: "team_viva", mode: "team_viva" });
        return;
      }
      switch (msg.type) {
        case "lobby": {
          setMembers((msg.members as TeamVivaMember[]) ?? []);
          setObservers((msg.observers as TeamVivaMember[]) ?? []);
          setLeadId((msg.lead_id as string) ?? null);
          // The server reports "paused" as its own ai_status. Map it onto the
          // existing muted/live pair so no consumer has to learn a third value,
          // and keep the paused flag in sync for a client that joins mid-pause.
          const reported = (msg.ai_status as string) ?? "muted";
          setAiPaused(reported === "paused");
          setAiStatus(reported === "muted" ? "muted" : "live");
          setStatus((s) => (s === "idle" || s === "connecting" ? "lobby" : s));
          break;
        }
        case "ai_paused":
          setAiPaused(true);
          setPausedBy((msg.by as string) ?? "Faculty");
          break;
        case "ai_resumed":
          setAiPaused(false);
          setPausedBy(null);
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
          report(String(msg.message ?? "Team viva error"), {
            kind: "ws_error",
            context: { feature: "team_viva", mode: "team_viva", reason: "server_error_message" },
          });
          setError(String(msg.message ?? "Team viva error"));
          setStatus((s) => (s === "live" ? s : "error"));
          break;
        default:
          break;
      }
    },
    [playAudioBuffer, stopPlayback],
  );

  const cleanupMedia = useCallback(() => {
    stopPlayback();
    try {
      workletNodeRef.current?.disconnect();
      micSourceRef.current?.disconnect();
    } catch (e) {
      // Leaks the mic node; the browser keeps showing the recording indicator.
      captureSilent(e, "media_teardown_failed", { feature: "team_viva", mode: "team_viva" });
    }
    workletNodeRef.current = null;
    micSourceRef.current = null;
    captureCtxRef.current
      ?.close()
      .catch((e) =>
        captureSilent(e, "capture_ctx_close_failed", { feature: "team_viva", mode: "team_viva" }),
      );
    captureCtxRef.current = null;
    // Browsers cap a page at ~6 AudioContexts; a silent leak here eventually
    // makes every later session silent.
    playbackCtxRef.current
      ?.close()
      .catch((e) =>
        captureSilent(e, "playback_ctx_close_failed", { feature: "team_viva", mode: "team_viva" }),
      );
    playbackCtxRef.current = null;
  }, [stopPlayback]);

  const join = useCallback(
    async (micStream: MediaStream, playbackAudioContext?: AudioContext | null) => {
      if (wsRef.current) return;
      // One trace per room join — see useLiveSession.
      startTrace();
      setStatus("connecting");
      setError("");
      setEvents([]);
      setSummary(null);
      setAudioBlocked(false);

      const token = getToken();
      if (!token) {
        setError("You are not signed in.");
        setStatus("error");
        return;
      }

      try {
        // Prefer the context the preflight created under the Start CLICK. A
        // context constructed here instead is born outside a user gesture and
        // browsers start it suspended → silent room with no way back.
        if (playbackAudioContext && playbackAudioContext.state !== "closed") {
          playbackCtxRef.current = playbackAudioContext;
        } else {
          const PlaybackCtx =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          playbackCtxRef.current = new PlaybackCtx();
        }
        // Autoplay policy refusing to resume is the most common cause of a
        // completely silent room.
        await playbackCtxRef.current
          .resume()
          .catch((e) =>
            captureSilent(e, "playback_resume_failed", { feature: "team_viva", mode: "team_viva" }),
          );
        if (playbackCtxRef.current.state !== "running") setAudioBlocked(true);
      } catch (e) {
        captureSilent(e, "playback_setup_failed", { feature: "team_viva", mode: "team_viva" });
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
          // AUDITED: expected. Feature detection — Firefox rejects a forced
          // sampleRate, so fall back to the default and resample in JS.
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
          if (
            !ws ||
            ws.readyState !== WebSocket.OPEN ||
            micMutedRef.current ||
            floorRef.current !== myProfileId
          )
            return;
          const pcm = floatToPCM16(e.data as Float32Array, inRate);
          ws.send(pcm);
        };
        source.connect(node);
        const sink = ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink);
        sink.connect(ctx.destination);
        workletNodeRef.current = node;
      } catch (e) {
        captureSilent(e, "mic_processor_setup_failed", { feature: "team_viva", mode: "team_viva" });
        setError("Could not access the microphone processor.");
        setStatus("error");
        return;
      }

      // pv=1 tells the server this client can decode tagged audio frames, which
      // is what makes it eligible to receive relayed human voice.
      const qs = new URLSearchParams({ token, language, persona, pv: "1" });
      // Trace propagation for the WebSocket leg — see useLiveSession. Dev only.
      if (import.meta.env.DEV) {
        for (const [key, value] of Object.entries(traceQuery())) qs.set(key, value);
      }
      const ws = new WebSocket(wsUrl(`/ws/team-viva/${sessionId}?${qs.toString()}`));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        // Never pass the socket URL here — it embeds the JWT (see wsUrl).
        report("team viva websocket error", {
          kind: "ws_error",
          context: {
            feature: "team_viva",
            mode: "team_viva",
            url_path: "/ws/team-viva",
            reason: "socket_error",
          },
        });
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

  /**
   * Faculty-only controls. The server enforces the permission itself, so a
   * student who somehow sends one of these gets a refusal rather than an effect
   * — these functions are a convenience, never the security boundary.
   */
  const pauseAI = useCallback((paused: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: paused ? "pause_ai" : "resume_ai" }));
  }, []);

  /** Hand the floor to a student, or pass `null` to give it back to the AI. */
  const grantFloor = useCallback((participantId: string | null) => {
    wsRef.current?.send(JSON.stringify({ type: "grant_floor", participant_id: participantId }));
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
      } catch (e) {
        // If this is lost the room never finalizes and nobody on the team gets
        // a report — the multi-participant version of "my session vanished".
        captureSilent(e, "end_send_failed", { feature: "team_viva", mode: "team_viva" });
      }
    }
    cleanupMedia();
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      try {
        ws?.close();
      } catch {
        // AUDITED: expected. Closing an already-closed socket. The close is
        // best-effort teardown and nothing downstream depends on it.
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
      // AUDITED: expected. Closing an already-closed socket during teardown.
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
    audioBlocked,
    observers,
    aiPaused,
    pausedBy,
    isMyFloor: floorSpeakerId === myProfileId,
    join,
    startViva,
    endViva,
    leave,
    toggleMic,
    unlockAudio,
    pauseAI,
    grantFloor,
  };
}
