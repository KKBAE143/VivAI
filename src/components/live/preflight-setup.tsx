/**
 * PreflightSetup — the "get ready" step before a live AI session.
 *
 * Fixes the old "configure just starts the screen with no prompts" gap: the
 * student explicitly picks a video source, checks their mic (live level meter),
 * confirms language + examiner persona, and grants permissions — then we open
 * the real-time connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Mic, MonitorUp, Volume2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { LIVE_LANGUAGES } from "@/lib/languages";

export type VideoSource = "screen" | "camera" | "none";

export interface PreflightResult {
  micStream: MediaStream;
  videoStream: MediaStream | null;
  language: string;
  persona: string;
}

interface PreflightSetupProps {
  mode: "viva" | "presentation" | "pitch" | "coach";
  defaultLanguage?: string;
  defaultPersona?: string;
  /** Show the examiner persona picker (viva). */
  showPersona?: boolean;
  /** Override the video sources offered. Defaults are mode-specific. */
  sources?: VideoSource[];
  onReady: (result: PreflightResult) => void;
}

/**
 * Mode-specific capture sources. A viva is a purely SPOKEN oral exam — no
 * screen, no camera. Only the AI Presentation shares a screen; the pitch drill
 * is voice-only.
 */
const MODE_SOURCES: Record<string, VideoSource[]> = {
  presentation: ["screen"],
  viva: ["none"],
  pitch: ["none"],
  coach: ["camera"],
};

const LANGUAGES = LIVE_LANGUAGES;
const PERSONAS = [
  { id: "friendly", label: "Friendly" },
  { id: "balanced", label: "Balanced" },
  { id: "strict", label: "Strict" },
  { id: "hostile", label: "Tough panel" },
];

const MODE_COPY: Record<string, { title: string; hint: string }> = {
  presentation: {
    title: "Get ready to present",
    hint: "Share your screen and talk through your project. The AI examiner will watch live, react, and ask questions.",
  },
  viva: {
    title: "Get ready for your viva",
    hint: "This is a spoken oral exam — no screen needed. The examiner will greet you, ask questions out loud, and you answer by speaking. Just talk naturally.",
  },
  pitch: {
    title: "Get ready to pitch",
    hint: "You have ~90 seconds. Cover problem, solution, tech and impact. The coach listens and reacts live.",
  },
  coach: {
    title: "Get ready to practice",
    hint: "Turn on your camera so the AI coach can watch your delivery — eye contact, posture and confidence — while you speak. It role-plays your scenario and coaches you live.",
  },
};

export function PreflightSetup({
  mode,
  defaultLanguage = "English",
  defaultPersona = "balanced",
  showPersona = false,
  sources: sourcesProp,
  onReady,
}: PreflightSetupProps) {
  const availableSources = sourcesProp ?? MODE_SOURCES[mode] ?? ["none"];
  const [language, setLanguage] = useState(defaultLanguage);
  const [persona, setPersona] = useState(defaultPersona);
  const [source, setSource] = useState<VideoSource>(availableSources[0]);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState("");
  const [level, setLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const screenSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

  // Acquire the mic up front so the student can see it working.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // autoGainControl added alongside the existing echo/noise constraints
          // to further reduce the greeting leaking back into the mic (WS1).
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        setMicReady(true);
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtor();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
          setLevel(Math.min(1, peak / 90));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled)
          setMicError("We couldn't access your microphone. Check browser permissions and reload.");
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      // Do not stop the mic stream here — it's handed off to the live session on start.
    };
  }, []);

  const handleStart = useCallback(async () => {
    setError("");
    if (!micStreamRef.current) {
      setError("Microphone is not ready yet.");
      return;
    }
    setStarting(true);
    try {
      let videoStream: MediaStream | null = null;
      if (source === "screen") {
        videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } else if (source === "camera") {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      }
      // Stop the meter loop; hand the mic stream to the live session.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      onReady({ micStream: micStreamRef.current, videoStream, language, persona });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setError("Permission was denied. Please allow access and try again.");
      } else {
        setError("Could not start capture. Try a different source.");
      }
      setStarting(false);
    }
  }, [source, language, persona, onReady]);

  const copy = MODE_COPY[mode] ?? MODE_COPY.viva;
  const ALL_SOURCES: { id: VideoSource; label: string; icon: typeof MonitorUp }[] = [
    { id: "screen", label: "Share screen", icon: MonitorUp },
    { id: "camera", label: "Camera", icon: Camera },
    { id: "none", label: "Audio only", icon: Mic },
  ];
  const sources = ALL_SOURCES.filter(
    (s) => availableSources.includes(s.id) && (s.id !== "screen" || screenSupported),
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-xl font-bold tracking-tight text-balance">{copy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.hint}</p>

        {/* Video source — only shown when the mode offers a real choice */}
        {sources.length > 1 ? (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What should the AI see?
            </h3>
            <div
              className={`mt-3 grid gap-3 ${sources.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {sources.map((s) => {
                const active = source === s.id;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSource(s.id)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          sources.length === 1 && (
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-secondary px-4 py-3">
              {(() => {
                const Icon = sources[0].icon;
                return <Icon className="h-5 w-5 shrink-0 text-primary" />;
              })()}
              <p className="text-sm text-muted-foreground">
                {sources[0].id === "screen" &&
                  "This session uses screen sharing — you'll pick the window/tab when you go live."}
                {sources[0].id === "none" &&
                  "This session is voice-only. Just speak — no screen or camera needed."}
                {sources[0].id === "camera" &&
                  "This session uses your camera so the examiner can see you."}
              </p>
            </div>
          )
        )}

        {/* Mic check */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Microphone
          </h3>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-secondary px-4 py-3">
            {micError ? (
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            ) : micReady ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            ) : (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">
                {micError
                  ? "Mic unavailable"
                  : micReady
                    ? "Mic connected — say something"
                    : "Requesting mic…"}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
            </div>
            <Volume2 className="h-4 w-4 text-muted-foreground" />
          </div>
          {micError && <p className="mt-2 text-sm text-destructive">{micError}</p>}
        </div>

        {/* Language + persona */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl bg-secondary px-4 py-3">
            <span className="text-xs text-muted-foreground">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-lg bg-card px-2 py-2 text-sm font-semibold focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          {showPersona && (
            <label className="rounded-xl bg-secondary px-4 py-3">
              <span className="text-xs text-muted-foreground">Examiner style</span>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="mt-1 w-full rounded-lg bg-card px-2 py-2 text-sm font-semibold focus:outline-none"
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <button
          onClick={() => void handleStart()}
          disabled={!micReady || starting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {starting ? "Connecting…" : "Everything looks good — Go live"}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          The AI will greet you and guide the session. Speak naturally — you can interrupt it any
          time.
        </p>
      </div>
    </div>
  );
}
