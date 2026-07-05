/**
 * LiveSessionRunner — orchestrates a real-time AI session: pre-flight setup ->
 * live stage -> completion. Shared by AI Presentation, Mock Viva and Pitch Drill
 * so all three get the same real-time, conversational experience.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveSession, type LiveMode, type LiveSummary } from "@/lib/useLiveSession";
import { PreflightSetup, type PreflightResult } from "./preflight-setup";
import { LiveStage } from "./live-stage";

interface LiveSessionRunnerProps {
  mode: LiveMode;
  sessionId: string;
  projectId?: string | null;
  title: string;
  subtitle?: string;
  defaultLanguage?: string;
  defaultPersona?: string;
  showPersona?: boolean;
  allowScreen?: boolean;
  /** Called once the live session ends (persisted). Parent shows the report. */
  onEnded: (summary: LiveSummary | null) => void;
}

export function LiveSessionRunner({
  mode,
  sessionId,
  projectId,
  title,
  subtitle,
  defaultLanguage = "English",
  defaultPersona = "balanced",
  showPersona = false,
  allowScreen = true,
  onEnded,
}: LiveSessionRunnerProps) {
  const [phase, setPhase] = useState<"setup" | "live">("setup");
  const [language, setLanguage] = useState(defaultLanguage);
  const [persona, setPersona] = useState(defaultPersona);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const endedRef = useRef(false);

  const live = useLiveSession({ mode, sessionId, language, persona, projectId });

  const handleReady = useCallback((result: PreflightResult) => {
    micStreamRef.current = result.micStream;
    setVideoStream(result.videoStream);
    setLanguage(result.language);
    setPersona(result.persona);
    setPhase("live");
  }, []);

  // Start the live connection once we enter the live phase with fresh settings.
  useEffect(() => {
    if (phase !== "live" || !micStreamRef.current) return;
    void live.start({ micStream: micStreamRef.current, videoStream });
    // Only run when entering the live phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // When the session ends, tear down media tracks and notify the parent once.
  useEffect(() => {
    if (
      (live.status === "ended" || live.status === "error") &&
      !endedRef.current &&
      phase === "live"
    ) {
      endedRef.current = true;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStream?.getTracks().forEach((t) => t.stop());
      onEnded(live.summary);
    }
  }, [live.status, live.summary, phase, videoStream, onEnded]);

  const handleEnd = useCallback(() => {
    if (!window.confirm("End this session? You'll see your full report next.")) return;
    live.stop();
  }, [live]);

  if (phase === "setup") {
    return (
      <PreflightSetup
        mode={mode}
        defaultLanguage={defaultLanguage}
        defaultPersona={defaultPersona}
        showPersona={showPersona}
        allowScreen={allowScreen}
        onReady={handleReady}
      />
    );
  }

  return (
    <LiveStage
      live={live}
      videoStream={videoStream}
      title={title}
      subtitle={subtitle}
      onEnd={handleEnd}
    />
  );
}
