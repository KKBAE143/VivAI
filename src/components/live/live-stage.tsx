/**
 * LiveStage — a dedicated three-pane desktop workspace for the live session.
 *
 * LEFT   — camera & session control (fixed, always visible: video, AI/user
 *          speaking indicators, mic/camera toggles, network, timer, progress).
 * CENTER — the conversation itself, ChatGPT-style, independently scrolling
 *          with "stick to bottom unless the user scrolls up" behaviour.
 * RIGHT  — the live AI panel: current question, live evaluation, strengths/
 *          weaknesses, coaching tips, question history, trend — labeled and
 *          shaped per practice mode, not one generic sidebar for everything.
 *
 * The page itself never scrolls; each pane manages its own overflow.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  X,
  Send,
  Sparkles,
  MessageCircleQuestion,
  Award,
  Loader2,
  Clock,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ListChecks,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ArrowDown,
  Eye,
  Ear,
} from "lucide-react";
import type { useLiveSession, LiveEvent, LiveMode } from "@/lib/useLiveSession";

type LiveHook = ReturnType<typeof useLiveSession>;

interface LiveStageProps {
  live: LiveHook;
  mode: LiveMode;
  videoStream: MediaStream | null;
  title: string;
  subtitle?: string;
  onEnd: () => void;
  /** Called when the student wants to retry after a connection failure. */
  onRetry?: () => void;
  /** Unlock AI speech if the browser autoplay policy blocked AudioContext. */
  onUnlockAudio?: () => void;
}

// How many questions the mode playbooks actually target (from live_service.py
// "Cover 5-8 questions" / "5-8 exchanges" / "2-3 rapid investor questions").
// Used only to show an honest "how far along are we" estimate — never a fake
// precise total, since the model decides the real count.
const EXPECTED_QUESTIONS: Record<LiveMode, number> = {
  viva: 7,
  presentation: 6,
  coach: 7,
  pitch: 3,
};

const MODE_QUESTION_LABEL: Record<LiveMode, string> = {
  viva: "Viva question",
  presentation: "Panel question",
  coach: "Practice prompt",
  pitch: "Investor question",
};

const MODE_EVAL_LABEL: Record<LiveMode, string> = {
  viva: "Viva evaluation",
  presentation: "Presentation evaluation",
  coach: "Delivery coaching",
  pitch: "Pitch evaluation",
};

interface QAItem {
  id: string;
  question: string;
  topic?: string | null;
  score?: number | null;
  feedback?: string | null;
  ts: number;
}

/** Group question/score events into one evolving per-question evaluation
 * instead of two disconnected feed entries — correlated by the server's
 * refId when available, falling back to a standalone score entry otherwise
 * (older clients / a score with no matching recorded question). */
export function groupQuestionsAndScores(events: LiveEvent[]): QAItem[] {
  const byId = new Map<string, QAItem>();
  const order: string[] = [];
  for (const ev of events) {
    if (ev.kind === "question") {
      const id = ev.refId ?? ev.id;
      byId.set(id, { id, question: ev.text, topic: ev.topic, score: null, feedback: null, ts: ev.ts });
      order.push(id);
    } else if (ev.kind === "score") {
      const existing = ev.refId ? byId.get(ev.refId) : undefined;
      if (existing) {
        existing.score = ev.score ?? null;
        existing.feedback = ev.text || null;
      } else {
        const id = `standalone_${ev.id}`;
        byId.set(id, {
          id,
          question: ev.topic ? `Discussion — ${ev.topic}` : "Live discussion",
          topic: ev.topic,
          score: ev.score ?? null,
          feedback: ev.text || null,
          ts: ev.ts,
        });
        order.push(id);
      }
    }
  }
  return order.map((id) => byId.get(id)!);
}

/** Simple, honest trend: compares the average score of the first half of
 * scored questions against the second half. No fabricated precision. */
export function computeTrend(scores: number[]): "up" | "down" | "flat" | null {
  if (scores.length < 2) return null;
  const mid = Math.floor(scores.length / 2);
  const first = scores.slice(0, mid);
  const second = scores.slice(mid);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const delta = avg(second) - avg(first);
  if (delta > 4) return "up";
  if (delta < -4) return "down";
  return "flat";
}

function ScrollBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-lg"
    >
      <ArrowDown className="h-3.5 w-3.5" /> New messages
    </button>
  );
}

function IndicatorRow({
  icon: Icon,
  label,
  active,
  activeTone = "text-success",
}: {
  icon: typeof Sparkles;
  label: string;
  active: boolean;
  activeTone?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${active ? "bg-secondary" : "bg-secondary/40"}`}
      >
        <Icon className={`h-3.5 w-3.5 ${active ? activeTone : "text-muted-foreground/50"}`} />
      </span>
      <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      {active && <span className={`ml-auto h-1.5 w-1.5 animate-pulse rounded-full ${activeTone.replace("text-", "bg-")}`} />}
    </div>
  );
}

export function LiveStage({ live, mode, videoStream, title, subtitle, onEnd, onRetry, onUnlockAudio }: LiveStageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  /** Accumulated seconds while unpaused — freezes the clock during pause. */
  const pausedAccumRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const sessionStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  // Session timer — counts only while live and not paused.
  useEffect(() => {
    if (live.status === "live" && sessionStartRef.current == null) {
      sessionStartRef.current = Date.now();
      lastTickRef.current = Date.now();
      pausedAccumRef.current = 0;
    }
    if (live.status !== "live") return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (!live.paused && lastTickRef.current != null) {
        pausedAccumRef.current += Math.max(0, now - lastTickRef.current);
      }
      lastTickRef.current = now;
      setElapsedSec(Math.floor(pausedAccumRef.current / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [live.status, live.paused]);

  // Track browser fullscreen state (Escape to exit, etc.).
  useEffect(() => {
    const onFs = () => {
      const el = rootRef.current;
      setIsFullscreen(Boolean(el && document.fullscreenElement === el));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (!document.fullscreenElement) {
        const el = rootRef.current;
        if (!el?.requestFullscreen) {
          setFullscreenError("Fullscreen is not supported in this browser.");
          return;
        }
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setFullscreenError("Could not toggle fullscreen. Try again or use F11.");
    }
  };

  // Auto-scroll ONLY while the user is already at (or near) the bottom —
  // never force-scroll past a message they scrolled up to read.
  useEffect(() => {
    if (!isAtBottom) return;
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [live.captions, live.liveUserText, live.liveAiText, isAtBottom]);

  const handleTranscriptScroll = () => {
    const el = transcriptRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < 80);
  };

  const scrollToBottom = () => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
  };

  const qaItems = useMemo(() => groupQuestionsAndScores(live.events), [live.events]);
  const observationEvents = useMemo(
    () => live.events.filter((ev) => ev.kind === "observation" || ev.kind === "flag"),
    [live.events],
  );
  const strengths = useMemo(
    () => observationEvents.filter((ev) => ev.observationKind === "strength").slice(-4).reverse(),
    [observationEvents],
  );
  const weaknesses = useMemo(
    () => observationEvents.filter((ev) => ev.observationKind === "issue").slice(-4).reverse(),
    [observationEvents],
  );
  const tips = useMemo(() => observationEvents.filter((ev) => ev.tip).slice(-3).reverse(), [observationEvents]);
  const scoredValues = useMemo(
    () => qaItems.map((q) => q.score).filter((s): s is number => s != null),
    [qaItems],
  );
  const trend = useMemo(() => computeTrend(scoredValues), [scoredValues]);
  const currentQuestion = qaItems.length > 0 ? qaItems[qaItems.length - 1] : null;
  const expectedQuestions = EXPECTED_QUESTIONS[mode] ?? 6;
  const progressPct = Math.min(100, Math.round((qaItems.length / expectedQuestions) * 100));

  const connecting = live.status === "connecting" || live.status === "idle";
  const userIsSpeaking = !connecting && !live.aiSpeaking && !live.micMuted && live.liveUserText.length > 0;
  const aiThinking =
    live.status === "live" &&
    !live.aiSpeaking &&
    !live.liveAiText &&
    live.captions.length > 0 &&
    live.captions[live.captions.length - 1].role === "student";

  // Network quality is derived honestly from the connection state we actually
  // observe — never a fabricated signal-strength number.
  const networkQuality: "good" | "checking" | "poor" =
    live.status === "error" ? "poor" : connecting ? "checking" : "good";

  const submitText = () => {
    if (!text.trim() || live.paused) return;
    live.pushText(text.trim());
    setText("");
  };

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div ref={rootRef} className="relative flex h-dvh overflow-hidden bg-background">
      {live.audioBlocked && onUnlockAudio && (
        <button
          type="button"
          onClick={() => onUnlockAudio()}
          className="absolute inset-x-0 top-0 z-40 border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-center text-sm font-semibold text-foreground backdrop-blur"
        >
          Tap here to enable AI voice (browser blocked sound)
        </button>
      )}
      {live.paused && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/80 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border border-border bg-card px-8 py-6 text-center shadow-[var(--shadow-card)]">
            <Pause className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-base font-semibold">Session paused</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Mic is muted and AI speech is frozen mid-sentence. Resume continues from the same
              point — your connection stays open.
            </p>
            <button
              type="button"
              onClick={() => live.resume()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          </div>
        </div>
      )}
      {/* ============================= LEFT PANE ============================= */}
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card/60 p-4 xl:w-80">
        <div>
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        {/* Same left rail as Mock Viva / pitch: media tile + controls (no camera for viva). */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-foreground/5">
          {videoStream && live.videoEnabled ? (
            <video ref={videoRef} muted playsInline className="aspect-video w-full bg-foreground/5 object-cover" />
          ) : (
            <div className="grid aspect-video place-items-center bg-secondary/50 text-muted-foreground">
              {videoStream ? <VideoOff className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            </div>
          )}
          {connecting && (
            <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${connecting ? "bg-muted-foreground" : "bg-success animate-pulse"}`} />
            {mode === "viva" ? "Oral exam" : "AI watching"}
          </span>
        </div>

        {/* Live indicators */}
        <div className="space-y-1.5 rounded-xl bg-secondary/40 p-2.5">
          <IndicatorRow icon={Sparkles} label="AI speaking" active={live.aiSpeaking} activeTone="text-primary" />
          <IndicatorRow icon={Ear} label="Listening for you" active={!connecting && !live.aiSpeaking && !live.micMuted} activeTone="text-success" />
          <IndicatorRow icon={Eye} label="You are speaking" active={userIsSpeaking} activeTone="text-success" />
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={live.toggleMic}
            disabled={live.paused}
            aria-label={live.micMuted ? "Unmute microphone" : "Mute microphone"}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold disabled:opacity-50 ${
              live.micMuted ? "bg-destructive text-destructive-foreground" : "bg-secondary"
            }`}
          >
            {live.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {live.micMuted ? "Unmute" : "Mute"}
          </button>
          {videoStream && (
            <button
              onClick={live.toggleVideo}
              disabled={live.paused}
              aria-label={live.videoEnabled ? "Turn camera off" : "Turn camera on"}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold disabled:opacity-50 ${
                !live.videoEnabled ? "bg-destructive text-destructive-foreground" : "bg-secondary"
              }`}
            >
              {live.videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {live.videoEnabled ? "Camera" : "Off"}
            </button>
          )}
        </div>

        {/* Network + timer */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-secondary/40 p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {networkQuality === "poor" ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              Network
            </div>
            <p
              className={`mt-1 font-semibold capitalize ${
                networkQuality === "good" ? "text-success" : networkQuality === "poor" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {networkQuality === "checking" ? "Connecting" : networkQuality}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Time
            </div>
            <p className="mt-1 font-mono font-semibold tabular-nums">{mm}:{ss}</p>
          </div>
        </div>

        {/* Question number + overall progress */}
        <div className="rounded-xl bg-secondary/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Question</span>
            <span className="font-semibold">{qaItems.length || "—"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Session progress</span>
            <span className="font-semibold">{progressPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-xs font-semibold hover:bg-secondary/80"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
            <button
              type="button"
              onClick={() => live.togglePause()}
              disabled={connecting || live.status === "error"}
              aria-label={live.paused ? "Resume session" : "Pause session"}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold disabled:opacity-50 ${
                live.paused ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
              }`}
            >
              {live.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {live.paused ? "Resume" : "Pause"}
            </button>
          </div>
          {fullscreenError && (
            <p className="text-[11px] text-destructive">{fullscreenError}</p>
          )}
          <button
            onClick={onEnd}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
          >
            <X className="h-4 w-4" /> End &amp; report
          </button>
        </div>
      </aside>

      {/* ============================ CENTER PANE ============================ */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <div
            ref={transcriptRef}
            onScroll={handleTranscriptScroll}
            className="h-full space-y-3 overflow-y-auto px-6 py-5"
          >
            {live.captions.length === 0 && !live.liveAiText && !live.liveUserText ? (
              <div className="grid h-full place-items-center">
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {connecting ? "Connecting to the examiner…" : "The examiner will greet you shortly. Start speaking when you're ready."}
                </p>
              </div>
            ) : null}
            {/* System message: session start */}
            {live.captions.length > 0 && (
              <div className="flex justify-center">
                <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  Session started
                </span>
              </div>
            )}
            {live.captions.map((c, i) => (
              <div key={i} className={`flex ${c.role === "student" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    c.role === "student" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                  }`}
                >
                  {c.text}
                </div>
              </div>
            ))}
            {live.liveUserText && (
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-2xl bg-primary/60 px-4 py-2.5 text-sm text-primary-foreground">
                  {live.liveUserText}
                </div>
              </div>
            )}
            {live.liveAiText && (
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-2xl bg-secondary/70 px-4 py-2.5 text-sm italic">{live.liveAiText}</div>
              </div>
            )}
            {aiThinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl bg-secondary px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            {live.status === "error" && (
              <div className="flex justify-center">
                <div className="max-w-md rounded-xl bg-destructive/10 px-4 py-3 text-center">
                  <p className="text-sm font-medium text-destructive">{live.error || "The live connection failed."}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nothing was recorded — your session isn&apos;t marked as completed.
                  </p>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="mt-2 rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      Retry session
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {!isAtBottom && <ScrollBottomButton onClick={scrollToBottom} />}
        </div>

        {/* Fixed input area */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background/80 px-6 py-3 backdrop-blur">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submitText();
            }}
            placeholder={live.paused ? "Resume to type or speak…" : "Type instead of speaking…"}
            disabled={live.paused}
            className="flex-1 rounded-xl bg-secondary px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            onClick={submitText}
            disabled={live.paused}
            aria-label="Send message"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </main>

      {/* ============================= RIGHT PANE ============================= */}
      <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-card/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{MODE_EVAL_LABEL[mode] ?? "Live evaluation"}</h2>

        {currentQuestion ? (
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MessageCircleQuestion className="h-3.5 w-3.5 text-warning" /> {MODE_QUESTION_LABEL[mode] ?? "Current question"}
              </span>
              {currentQuestion.score != null ? (
                <span className={`text-sm font-bold ${currentQuestion.score >= 60 ? "text-success" : "text-warning"}`}>
                  {currentQuestion.score}/100
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> Evaluating…
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm leading-snug">{currentQuestion.question}</p>
            {currentQuestion.feedback && <p className="mt-1.5 text-xs leading-snug text-primary">{currentQuestion.feedback}</p>}
          </div>
        ) : (
          <div className="rounded-2xl bg-card p-4 text-center text-xs text-muted-foreground shadow-[var(--shadow-card)]">
            The current question will appear here once the session begins.
          </div>
        )}

        {(strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid gap-3">
            {strengths.length > 0 && (
              <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Strengths so far
                </h3>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {strengths.map((s) => (
                    <li key={s.id} className="flex gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-success" /> {s.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Watch out for
                </h3>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {weaknesses.map((w) => (
                    <li key={w.id} className="flex gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-warning" /> {w.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tips.length > 0 && (
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-primary" /> Coaching tips
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs">
              {tips.map((t) => (
                <li key={t.id} className="rounded-lg bg-secondary px-2.5 py-1.5">{t.tip}</li>
              ))}
            </ul>
          </div>
        )}

        {qaItems.length > 0 && (
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Question history
              </h3>
              {trend && (
                <span
                  className={`flex items-center gap-1 text-[11px] font-medium ${
                    trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {trend === "up" ? "Improving" : trend === "down" ? "Slipping" : "Steady"}
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {[...qaItems].reverse().map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 truncate">{q.question}</span>
                  {q.score != null ? (
                    <span className={`shrink-0 font-semibold ${q.score >= 60 ? "text-success" : "text-warning"}`}>{q.score}</span>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">
                      <Award className="h-3 w-3 opacity-40" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {qaItems.length === 0 && observationEvents.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Evaluation, coaching tips and scores will build up here live as the session runs.
          </p>
        )}
      </aside>
    </div>
  );
}
