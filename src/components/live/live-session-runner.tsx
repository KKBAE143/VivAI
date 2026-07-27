/**
 * LiveSessionRunner — orchestrates a real-time AI session: pre-flight setup ->
 * live stage -> completion. Shared by AI Presentation, Mock Viva and Pitch Drill
 * so all three get the same real-time, conversational experience.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLiveSession, type LiveMode, type LiveSummary } from "@/lib/useLiveSession";
import { PreflightSetup, type PreflightResult, type VideoSource } from "./preflight-setup";
import { LiveStage } from "./live-stage";

interface LiveSessionRunnerProps {
  mode: LiveMode;
  sessionId: string;
  projectId?: string | null;
  /** Free-text subject / topic / focus, forwarded to the live examiner. */
  subject?: string | null;
  title: string;
  subtitle?: string;
  defaultLanguage?: string;
  defaultPersona?: string;
  showPersona?: boolean;
  /** Language/persona were fixed at session creation; the server always uses
   * the stored value, so the preflight shows them read-only instead of an
   * editable control that would silently have no effect (viva). */
  configLocked?: boolean;
  /** Override the capture sources offered (defaults are mode-specific). */
  sources?: VideoSource[];
  /** Called once the live session ends (persisted). Parent shows the report. */
  onEnded: (summary: LiveSummary | null) => void;
}

export function LiveSessionRunner({
  mode,
  sessionId,
  projectId,
  subject,
  title,
  subtitle,
  defaultLanguage = "English",
  defaultPersona = "balanced",
  showPersona = false,
  configLocked = false,
  sources,
  onEnded,
}: LiveSessionRunnerProps) {
  const [phase, setPhase] = useState<"setup" | "live">("setup");
  const [language, setLanguage] = useState(defaultLanguage);
  const [persona, setPersona] = useState(defaultPersona);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const endedRef = useRef(false);
  /**
   * Identifies one "enter the live phase" attempt. Incremented by preflight and
   * by retry; the start effect records the run it started so a React Strict
   * Mode remount (effect -> cleanup -> effect) re-runs against the SAME token
   * and declines to start a second time. A bare boolean could not distinguish
   * "already started this run" from "a new run needs starting".
   */
  const liveRunRef = useRef(0);
  const startedRunRef = useRef<number | null>(null);

  const live = useLiveSession({ mode, sessionId, language, persona, projectId, subject });

  const playbackCtxRef = useRef<AudioContext | null>(null);

  const handleReady = useCallback((result: PreflightResult) => {
    micStreamRef.current = result.micStream;
    setVideoStream(result.videoStream);
    setVideoSource(result.videoSource);
    setLanguage(result.language);
    setPersona(result.persona);
    playbackCtxRef.current = result.playbackAudioContext;
    liveRunRef.current += 1;
    startedRunRef.current = null;
    setPhase("live");
  }, []);

  // Start the live connection once we enter the live phase with fresh settings.
  // Do NOT reset() in this effect's cleanup — that races React Strict Mode and
  // can close the preflight AudioContext mid-start. Instead the effect is made
  // idempotent per run token, so a Strict Mode remount is a no-op rather than a
  // second socket. useLiveSession also holds a sync start lock + generation
  // counter, and the server now closes any superseded connection outright.
  useEffect(() => {
    if (phase !== "live" || !micStreamRef.current) return;
    const run = liveRunRef.current;
    if (startedRunRef.current === run) return;
    startedRunRef.current = run;
    // "none" (audio-only) carries no video source for the server to track.
    void live.start({
      micStream: micStreamRef.current,
      videoStream,
      videoSource: videoSource === "camera" || videoSource === "screen" ? videoSource : null,
      playbackAudioContext: playbackCtxRef.current,
    });
    // Only run when entering the live phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // When the session ends cleanly, tear down media tracks and notify the parent once.
  // Errors do NOT complete the session — the student stays here and can retry.
  useEffect(() => {
    if (live.status === "ended" && !endedRef.current && phase === "live") {
      endedRef.current = true;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStream?.getTracks().forEach((t) => t.stop());
      onEnded(live.summary);
    }
    if (live.status === "error" && phase === "live") {
      // A failure cancels the "preparing report" state so the retry UI shows.
      setEnding(false);
      // Free the devices; the retry flow re-acquires them in pre-flight.
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      videoStream?.getTracks().forEach((t) => t.stop());
    }
  }, [live.status, live.summary, phase, videoStream, onEnded]);

  const handleRetry = useCallback(() => {
    setEnding(false);
    setVideoStream(null);
    setVideoSource(null);
    // A retry is a new run; preflight will bump the token again on its way back.
    liveRunRef.current += 1;
    startedRunRef.current = null;
    endedRef.current = false;
    live.reset();
    setPhase("setup");
  }, [live]);

  const handleEnd = useCallback(() => setConfirmEnd(true), []);

  const confirmEndSession = useCallback(() => {
    setConfirmEnd(false);
    setEnding(true);
    live.stop();
  }, [live]);

  if (phase === "setup") {
    return (
      <PreflightSetup
        mode={mode}
        defaultLanguage={defaultLanguage}
        defaultPersona={defaultPersona}
        showPersona={showPersona}
        configLocked={configLocked}
        sources={sources}
        onReady={handleReady}
      />
    );
  }

  return (
    <>
      <LiveStage
        live={live}
        mode={mode}
        videoStream={videoStream}
        title={title}
        subtitle={subtitle}
        onEnd={handleEnd}
        onRetry={handleRetry}
        onUnlockAudio={live.unlockAudio}
      />
      {ending && live.status !== "error" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
              <p className="text-base font-semibold text-foreground">Preparing your report…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Analyzing your session. This takes a few seconds.
              </p>
            </div>
          </div>
        </div>
      )}
      {confirmEnd && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-session-title"
          onClick={() => setConfirmEnd(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="end-session-title" className="text-lg font-semibold text-foreground">
              End this session?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We&apos;ll wrap up and prepare your full report from the conversation so far. You
              can&apos;t resume once it ends.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmEnd(false)}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
              >
                Keep going
              </button>
              <button
                onClick={confirmEndSession}
                className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                End &amp; see report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
