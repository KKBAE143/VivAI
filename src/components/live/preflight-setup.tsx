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
import { usePersonaCatalog } from "@/lib/hooks-features";

export type VideoSource = "screen" | "camera" | "none";

export interface PreflightResult {
  micStream: MediaStream;
  videoStream: MediaStream | null;
  videoSource: VideoSource | null;
  language: string;
  persona: string;
  /**
   * Playback AudioContext created under the Start click (user gesture) so the
   * browser will actually play AI speech. Creating it later in a useEffect is
   * often blocked by autoplay policy → silent sessions.
   */
  playbackAudioContext: AudioContext;
}

interface PreflightSetupProps {
  mode: "viva" | "presentation" | "pitch" | "coach" | "team_viva";
  defaultLanguage?: string;
  defaultPersona?: string;
  /** Show the examiner persona picker (viva). */
  showPersona?: boolean;
  /** Language and persona were fixed at session creation and the server
   * always uses the stored value regardless of what's sent at connect time
   * (viva). Showing them as editable here would be a control that silently
   * does nothing when changed — render read-only instead, honestly. */
  configLocked?: boolean;
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
  team_viva: ["none"],
};

const LANGUAGES = LIVE_LANGUAGES;
// Fallback shown only while the catalog is loading, so the picker never
// flashes empty — the server-owned list (incl. "calm") replaces this once
// usePersonaCatalog() resolves.
const FALLBACK_PERSONAS = [
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
  team_viva: {
    title: "Get your mic ready",
    hint: "This is a spoken team viva — no screen needed. Once everyone's in the lobby and the lead starts the session, the AI will call on people one at a time; only speak when it's your turn.",
  },
};

export function PreflightSetup({
  mode,
  defaultLanguage = "English",
  defaultPersona = "balanced",
  showPersona = false,
  configLocked = false,
  sources: sourcesProp,
  onReady,
}: PreflightSetupProps) {
  const availableSources = sourcesProp ?? MODE_SOURCES[mode] ?? ["none"];
  const personaCatalog = usePersonaCatalog();
  const personas = personaCatalog.data?.length ? personaCatalog.data : FALLBACK_PERSONAS;
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
  /**
   * Synchronous single-start latch. `starting` disables the button, but state
   * updates are async: two clicks landing in the same tick both passed the
   * disabled check, each ran getDisplayMedia and each created a playback
   * AudioContext, handing the session two of everything. A ref closes that
   * window because it takes effect before the next line runs.
   */
  const startingRef = useRef(false);
  /**
   * Set once onReady() has actually taken ownership of the mic stream. Until
   * then this component still owns it, and unmounting must release it — the
   * cleanup below used to skip stopping the tracks unconditionally, so a
   * student who opened the preflight and navigated away instead of going live
   * left their microphone open (recording indicator on) until a page reload.
   */
  const handedOffRef = useRef(false);
  /** Canvas element created by native screen capture, cleaned up on unmount. */
  const nativeCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Clean up native capture resources if the user navigates away before going live.
  useEffect(() => {
    return () => {
      nativeCaptureCanvasRef.current?.remove();
      nativeCaptureCanvasRef.current = null;
      // Remove global callbacks registered by the native ScreenShareBridge.
      delete (window as unknown as Record<string, unknown>)["__wtaOnScreenFrame"];
      delete (window as unknown as Record<string, unknown>)["__wtaOnScreenFrameStop"];
    };
  }, []);

  const screenSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const nativeScreenShareAvailable =
    typeof window !== "undefined" &&
    typeof (window as unknown as Record<string, unknown>).ScreenShareBridge !== "undefined";

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
      audioCtxRef.current = null;
      // Release the mic UNLESS the live session took ownership of it on start.
      if (!handedOffRef.current) {
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  /**
   * Start native screen capture via the WebToApp ScreenShareBridge.
   * Creates a hidden canvas, starts the native MediaProjection capture,
   * and returns a synthetic MediaStream via canvas.captureStream().
   * Falls back to null if the bridge is unavailable or the user cancels.
   */
  const startNativeScreenCapture = useCallback(async (): Promise<MediaStream | null> => {
    const bridge = (window as unknown as Record<string, unknown>).ScreenShareBridge as
      | {
          startCapture: (cb: string, quality: number) => void;
          stopCapture: () => void;
          isSupported: () => boolean;
        }
      | undefined;
    if (!bridge) return null;

    // Create a hidden canvas that the native bridge will draw into
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.position = "fixed";
    canvas.style.top = "-9999px";
    canvas.style.left = "-9999px";
    canvas.style.pointerEvents = "none";
    document.body.appendChild(canvas);

    nativeCaptureCanvasRef.current = canvas;
    const canvasRef = { current: canvas } as { current: HTMLCanvasElement };
    let captureFailed = false;

    // Set up the global frame callback
    const frameCallbackName = "__wtaOnScreenFrame";
    (window as unknown as Record<string, unknown>)[frameCallbackName] = (
      base64Jpeg: string | null,
      errorMsg?: string,
    ) => {
      if (!base64Jpeg || !canvasRef.current.parentNode) {
        // null means error or stop, remove the canvas
        captureFailed = true;
        return;
      }
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        if (!c.parentNode) return;
        if (c.width !== img.width || c.height !== img.height) {
          c.width = img.width;
          c.height = img.height;
        }
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
      };
      img.onerror = () => {
        captureFailed = true;
      };
      img.src = "data:image/jpeg;base64," + base64Jpeg;
    };
    // Also handle the stop callback
    const stopCallbackName = "__wtaOnScreenFrameStop";
    let stoppedBySystem = false;
    (window as unknown as Record<string, unknown>)[stopCallbackName] = () => {
      stoppedBySystem = true;
    };

    // Start native capture
    bridge.startCapture(frameCallbackName, 60);

    // Wait briefly for the consent dialog and first frame
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    // Check if the bridge started the capture dialog
    // We'll wait a bit more for the user to accept
    let waited = 0;
    const maxWait = 15000; // 15 seconds max for user to grant permission
    while (waited < maxWait && !captureFailed && !stoppedBySystem && canvas.width <= 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      waited += 200;
    }

    if (captureFailed || stoppedBySystem || canvas.width <= 1) {
      canvas.remove();
      nativeCaptureCanvasRef.current = null;
      delete (window as unknown as Record<string, unknown>)[frameCallbackName];
      delete (window as unknown as Record<string, unknown>)[stopCallbackName];
      throw new DOMException("Screen capture was cancelled or unavailable", "NotAllowedError");
    }

    // Create a synthetic MediaStream from the canvas
    // canvas.captureStream(fps) returns a MediaStream
    const syntheticStream = (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(1);
    if (!syntheticStream) {
      // captureStream not supported in this WebView — stop native capture and throw
      bridge.stopCapture();
      canvas.remove();
      nativeCaptureCanvasRef.current = null;
      delete (window as unknown as Record<string, unknown>)[frameCallbackName];
      delete (window as unknown as Record<string, unknown>)[stopCallbackName];
      throw new Error(
        "Screen sharing uses canvas.captureStream() which is not supported in this version of Android System WebView. Please update WebView via Play Store or use Chrome browser.",
      );
    }

    return syntheticStream;
  }, []);

  const handleStart = useCallback(async () => {
    if (startingRef.current) return;
    setError("");
    if (!micStreamRef.current) {
      setError("Microphone is not ready yet.");
      return;
    }
    startingRef.current = true;
    setStarting(true);
    try {
      let videoStream: MediaStream | null = null;
      if (source === "screen" && nativeScreenShareAvailable) {
        // Use native Android screen capture bridge in WebView APK.
        // The bridge returns frames as base64 JPEG via a global callback;
        // we draw them onto a canvas and create a synthetic MediaStream.
        videoStream = await startNativeScreenCapture();
      } else if (source === "screen") {
        videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } else if (source === "camera") {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      }
      // Stop the meter loop; hand the mic stream to the live session.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;

      // CRITICAL: unlock AI speech playback under this user gesture. A new
      // AudioContext created later (in useEffect after connect) stays suspended
      // in Chrome/Safari → transcripts may appear but no sound.
      const PlaybackCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const playbackAudioContext = new PlaybackCtor();
      await playbackAudioContext.resume().catch(() => {});

      try {
        onReady({
          micStream: micStreamRef.current,
          videoStream,
          videoSource: videoStream ? source : null,
          language,
          persona,
          playbackAudioContext,
        });
        handedOffRef.current = true;
      } catch (handoffError) {
        // Nobody took ownership, so nobody will ever close these. Browsers cap
        // a page at roughly six AudioContexts; leaking one per failed attempt
        // eventually makes every future session silent.
        void playbackAudioContext.close().catch(() => {});
        videoStream?.getTracks().forEach((t) => t.stop());
        throw handoffError;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setError("Permission was denied. Please allow access and try again.");
      } else {
        setError("Could not start capture. Try a different source.");
      }
      // Release the latch only on failure — on success this component is
      // replaced by the live stage and must never start a second session.
      startingRef.current = false;
      setStarting(false);
    }
  }, [source, language, persona, onReady]);

  const copy = MODE_COPY[mode] ?? MODE_COPY.viva;
  const ALL_SOURCES: { id: VideoSource; label: string; icon: typeof MonitorUp }[] = [
    { id: "screen", label: "Share screen", icon: MonitorUp },
    { id: "camera", label: "Camera", icon: Camera },
    { id: "none", label: "Audio only", icon: Mic },
  ];
  // In WebView APK, native ScreenShareBridge replaces getDisplayMedia().
  // On desktop browsers, the standard getDisplayMedia() is used.
  const canScreenShare = nativeScreenShareAvailable || screenSupported;
  const sources = ALL_SOURCES.filter(
    (s) => availableSources.includes(s.id) && (s.id !== "screen" || canScreenShare),
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
          {configLocked ? (
            <div className="rounded-xl bg-secondary px-4 py-3">
              <span className="text-xs text-muted-foreground">Language</span>
              <div className="mt-1 text-sm font-semibold">{language}</div>
            </div>
          ) : (
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
          )}
          {showPersona &&
            (configLocked ? (
              <div className="rounded-xl bg-secondary px-4 py-3">
                <span className="text-xs text-muted-foreground">Examiner style</span>
                <div className="mt-1 text-sm font-semibold">
                  {personas.find((p) => p.id === persona)?.label ?? persona}
                </div>
              </div>
            ) : (
              <label className="rounded-xl bg-secondary px-4 py-3">
                <span className="text-xs text-muted-foreground">Examiner style</span>
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-card px-2 py-2 text-sm font-semibold focus:outline-none"
                >
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
        {configLocked && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Set when you configured this session — change them from the session setup screen
            instead.
          </p>
        )}

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
