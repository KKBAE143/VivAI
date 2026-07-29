/**
 * LiveStage — the live session workspace.
 *
 * Three panes side by side from `lg` up. Below that the fixed-width sidebars
 * cannot fit, so small screens show ONE pane at a time behind a tab bar, with
 * mic / pause / end hoisted into a persistent action bar so they are never more
 * than one tap away.
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

/**
 * Roughly how long one spoken question-and-answer exchange takes.
 *
 * Mirrors `SECONDS_PER_EXCHANGE` in `backend/ai/live_service.py` — change both
 * together. Used only to show the student the same question range the examiner
 * was told to work to, never to assert a precise total: the model decides the
 * real count.
 */
const SECONDS_PER_EXCHANGE = 110;

/** Fallback when the server reports no configured limit. */
const EXPECTED_QUESTIONS: Record<LiveMode, number> = {
  viva: 7,
  presentation: 6,
  coach: 7,
  pitch: 3,
};

function questionBudget(durationSec: number | null, mode: LiveMode): number {
  if (!durationSec) return EXPECTED_QUESTIONS[mode] ?? 6;
  return Math.max(3, Math.min(10, Math.floor(durationSec / SECONDS_PER_EXCHANGE)));
}

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
      byId.set(id, {
        id,
        question: ev.text,
        topic: ev.topic,
        score: null,
        feedback: null,
        ts: ev.ts,
      });
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

/**
 * Colour a score by the band it falls in, not by a single pass/fail line.
 *
 * `score >= 60 ? green : amber` painted a 62 the same triumphant green as a 95
 * and made every mark look like a pass, which is exactly the false reassurance
 * the calibrated rubric is meant to remove. Mirrors the bands in
 * `backend/ai/live_service.py`.
 */
function scoreTone(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-foreground";
  if (score >= 55) return "text-warning";
  return "text-destructive";
}

function scoreChip(score: number): string {
  if (score >= 85) return "bg-success/15 text-success";
  if (score >= 70) return "bg-secondary text-foreground";
  if (score >= 55) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

/**
 * Strip the markdown the model sprinkles into spoken-word fields.
 *
 * Observation evidence and feedback come back with `*emphasis*` and leading
 * `* ` bullets, which render as literal asterisks in the live panel — the model
 * is writing for a chat window, not for our cards. Cheaper and safer than
 * rendering untrusted model output as markdown.
 */
export function plainText(value: string): string {
  return value
    .replace(/^\s*[*-]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
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

/**
 * The examiner, for sessions that have no video to show.
 *
 * Voice-only is the majority case (a viva has neither a camera nor a screen
 * share) and it used to be represented by an empty box. The state here is all
 * genuinely observed — speaking, listening, muted, paused — so the animation
 * carries information rather than decorating a dead panel.
 */
function ExaminerPresence({
  connecting,
  aiSpeaking,
  listening,
  userSpeaking,
  micMuted,
  paused,
  label,
}: {
  connecting: boolean;
  aiSpeaking: boolean;
  listening: boolean;
  userSpeaking: boolean;
  micMuted: boolean;
  paused: boolean;
  label: string;
}) {
  const state = connecting
    ? { text: "Connecting…", tone: "text-muted-foreground" }
    : paused
      ? { text: "Paused", tone: "text-muted-foreground" }
      : aiSpeaking
        ? { text: "Examiner speaking", tone: "text-primary" }
        : micMuted
          ? { text: "Your mic is muted", tone: "text-destructive" }
          : userSpeaking
            ? { text: "Listening to you", tone: "text-success" }
            : { text: "Waiting for your answer", tone: "text-muted-foreground" };

  const active = aiSpeaking || (listening && userSpeaking);
  return (
    <div className="relative flex aspect-video flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-secondary/60 to-secondary/20">
      <div className="relative grid h-20 w-20 place-items-center">
        {/* Two staggered rings, only while something is actually happening. */}
        {active && (
          <>
            <span
              className={`absolute inset-0 animate-ping rounded-full ${
                aiSpeaking ? "bg-primary/20" : "bg-success/20"
              }`}
            />
            <span
              className={`absolute inset-2 animate-ping rounded-full ${
                aiSpeaking ? "bg-primary/25" : "bg-success/25"
              }`}
              style={{ animationDelay: "0.4s" }}
            />
          </>
        )}
        <span
          className={`relative grid h-14 w-14 place-items-center rounded-full shadow-sm transition-colors ${
            connecting || paused
              ? "bg-muted"
              : aiSpeaking
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground"
          }`}
        >
          {connecting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : paused ? (
            <Pause className="h-6 w-6" />
          ) : aiSpeaking ? (
            <Sparkles className="h-6 w-6" />
          ) : (
            <Ear className="h-6 w-6" />
          )}
        </span>
      </div>
      <p className={`text-xs font-semibold ${state.tone}`}>{state.text}</p>
      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connecting ? "bg-muted-foreground" : "animate-pulse bg-success"
          }`}
        />
        {label}
      </span>
    </div>
  );
}

/**
 * One turn in the transcript.
 *
 * The student's side used to be a solid `bg-primary` bubble. That reads fine for
 * a chat reply and badly here: a spoken viva answer runs to a full paragraph, so
 * the transcript became alternating walls of saturated orange with white text —
 * the hardest possible thing to read back, in the pane students spend the whole
 * session looking at. A tinted panel with an accent edge keeps the ownership cue
 * without shouting, and both sides are attributed so a long answer stays
 * readable after scrolling back.
 */
function Turn({
  role,
  text,
  interim = false,
}: {
  role: "student" | "examiner";
  text: string;
  interim?: boolean;
}) {
  const isStudent = role === "student";
  return (
    <div className={`flex flex-col gap-1 ${isStudent ? "items-end" : "items-start"}`}>
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {isStudent ? "You" : "Examiner"}
        {interim && " · speaking"}
      </span>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isStudent
            ? "border-r-2 border-primary bg-primary/10 text-foreground"
            : "bg-secondary text-foreground"
        } ${interim ? "opacity-70" : ""}`}
      >
        {text}
      </div>
    </div>
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
      <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      {active && (
        <span
          className={`ml-auto h-1.5 w-1.5 animate-pulse rounded-full ${activeTone.replace("text-", "bg-")}`}
        />
      )}
    </div>
  );
}

export function LiveStage({
  live,
  mode,
  videoStream,
  title,
  subtitle,
  onEnd,
  onRetry,
  onUnlockAudio,
}: LiveStageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  /**
   * Which pane is visible below `lg`.
   *
   * The three-pane desktop layout uses fixed-width sidebars (w-72 / w-96) inside
   * `h-dvh overflow-hidden`; on a phone those do not shrink, they just overflow.
   * Stacking all three vertically would give each a third of the viewport, which
   * is unusable for a live conversation — so small screens get one pane at a
   * time with a tab bar. At `lg` and above this state is ignored entirely and
   * the original layout renders unchanged.
   *
   * Defaults to the conversation: that is the session.
   */
  const [mobilePane, setMobilePane] = useState<"session" | "chat" | "insights">("chat");
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
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [live.captions, live.liveUserText, live.liveAiText, isAtBottom]);

  const handleTranscriptScroll = () => {
    const el = transcriptRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < 80);
  };

  const scrollToBottom = () => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
    setIsAtBottom(true);
  };

  const qaItems = useMemo(() => groupQuestionsAndScores(live.events), [live.events]);
  const observationEvents = useMemo(
    () => live.events.filter((ev) => ev.kind === "observation" || ev.kind === "flag"),
    [live.events],
  );
  const strengths = useMemo(
    () =>
      observationEvents
        .filter((ev) => ev.observationKind === "strength")
        .slice(-4)
        .reverse(),
    [observationEvents],
  );
  const weaknesses = useMemo(
    () =>
      observationEvents
        .filter((ev) => ev.observationKind === "issue")
        .slice(-4)
        .reverse(),
    [observationEvents],
  );
  const tips = useMemo(
    () =>
      observationEvents
        .filter((ev) => ev.tip)
        .slice(-3)
        .reverse(),
    [observationEvents],
  );
  const scoredValues = useMemo(
    () => qaItems.map((q) => q.score).filter((s): s is number => s != null),
    [qaItems],
  );
  const trend = useMemo(() => computeTrend(scoredValues), [scoredValues]);
  const currentQuestion = qaItems.length > 0 ? qaItems[qaItems.length - 1] : null;
  const expectedQuestions = questionBudget(live.durationSec, mode);
  /**
   * Progress against the CLOCK, not a guessed question count.
   *
   * This used to be `questions logged / 7`, which is why a session could sit at
   * "43%" with no relationship to anything the student chose — 7 was hardcoded
   * regardless of whether they picked 5 minutes or 30. Time is the honest
   * denominator: it is the thing that is actually bounded, and the server
   * enforces it.
   */
  const remainingSec = live.durationSec != null ? Math.max(0, live.durationSec - elapsedSec) : null;
  const overtime = live.durationSec != null && elapsedSec > live.durationSec;
  const progressPct =
    live.durationSec != null
      ? Math.min(100, Math.round((elapsedSec / live.durationSec) * 100))
      : Math.min(100, Math.round((qaItems.length / expectedQuestions) * 100));

  const connecting = live.status === "connecting" || live.status === "idle";
  // A Gemini connection recycles roughly every 10 minutes; the server resumes
  // the same conversation transparently. Show it, but never treat it as a
  // failure — the transcript and the report survive it.
  const reconnecting = live.status === "reconnecting";
  const userIsSpeaking =
    !connecting && !live.aiSpeaking && !live.micMuted && live.liveUserText.length > 0;
  const aiThinking =
    live.status === "live" &&
    !live.aiSpeaking &&
    !live.liveAiText &&
    live.captions.length > 0 &&
    live.captions[live.captions.length - 1].role === "student";

  // Network quality is derived honestly from the connection state we actually
  // observe — never a fabricated signal-strength number.
  const networkQuality: "good" | "checking" | "poor" =
    live.status === "error" ? "poor" : connecting || reconnecting ? "checking" : "good";

  const submitText = () => {
    if (!text.trim() || live.paused) return;
    live.pushText(text.trim());
    setText("");
  };

  const clock = (total: number) => {
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(Math.floor(total % 60)).padStart(2, "0");
    return `${mm}:${ss}`;
  };
  const elapsedLabel = clock(elapsedSec);
  // Count DOWN when there is a limit — that is the number a student in an exam
  // actually needs. Elapsed stays available as the secondary line.
  const primaryClock = remainingSec != null ? clock(remainingSec) : elapsedLabel;
  const clockUrgent = remainingSec != null && remainingSec <= 60;

  return (
    <div
      ref={rootRef}
      className="relative flex h-dvh flex-col overflow-hidden bg-background lg:flex-row"
    >
      {live.audioBlocked && onUnlockAudio && (
        <button
          type="button"
          onClick={() => onUnlockAudio()}
          className="absolute inset-x-0 top-0 z-40 border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-center text-sm font-semibold text-foreground backdrop-blur"
        >
          Tap here to enable AI voice (browser blocked sound)
        </button>
      )}
      {reconnecting && (
        <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-sm font-semibold text-foreground backdrop-blur">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reconnecting to the examiner — your conversation is saved, hold on a moment.
        </div>
      )}
      {live.timeUp && live.status === "live" && (
        // The server has asked the examiner to close and will end the session
        // itself shortly. Saying so beats an unexplained ending.
        <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-sm font-semibold text-foreground backdrop-blur">
          <Clock className="h-4 w-4" />
          Time&apos;s up — finish your answer, the examiner is wrapping up and your report is next.
        </div>
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
      {/* ===================== MOBILE ACTION BAR (< lg) ====================== */}
      {/* The End button lives at the bottom of the left pane on desktop. On a
          phone the student may be on any tab, so the controls that must never
          be more than one tap away are hoisted into a persistent bar. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 py-2 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{title}</p>
          <p
            className={`font-mono text-[11px] tabular-nums ${
              clockUrgent ? "font-semibold text-destructive" : "text-muted-foreground"
            }`}
          >
            {remainingSec != null ? `${primaryClock} left` : primaryClock}
            {live.paused ? " · paused" : ""}
          </p>
        </div>
        <button
          onClick={live.toggleMic}
          disabled={live.paused}
          aria-label={live.micMuted ? "Unmute microphone" : "Mute microphone"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl disabled:opacity-50 ${
            live.micMuted ? "bg-destructive text-destructive-foreground" : "bg-secondary"
          }`}
        >
          {live.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => live.togglePause()}
          disabled={connecting || live.status === "error"}
          aria-label={live.paused ? "Resume session" : "Pause session"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl disabled:opacity-50 ${
            live.paused ? "bg-primary text-primary-foreground" : "bg-secondary"
          }`}
        >
          {live.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button
          onClick={onEnd}
          aria-label="End session and see report"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground"
        >
          <X className="h-3.5 w-3.5" /> End
        </button>
      </div>

      {/* ============================= LEFT PANE ============================= */}
      <aside
        className={`${
          mobilePane === "session" ? "flex" : "hidden"
        } min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border-border bg-card/60 p-4 lg:flex lg:w-72 lg:border-r xl:w-80`}
      >
        <div>
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        {/*
          Video when there is video; otherwise the examiner itself.

          A viva has no camera and no screen share, so this slot used to render
          an empty grey 16:9 box with a decorative icon in it — the largest
          element on the screen, showing nothing, in the mode students use most.
          Voice-only sessions now get a presence panel that actually tracks the
          conversation, which is the only thing there is to show.
        */}
        {videoStream ? (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-foreground/5">
            {live.videoEnabled ? (
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full bg-foreground/5 object-cover"
              />
            ) : (
              <div className="grid aspect-video place-items-center bg-secondary/50 text-muted-foreground">
                <VideoOff className="h-6 w-6" />
              </div>
            )}
            {connecting && (
              <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
              <span
                className={`h-1.5 w-1.5 rounded-full ${connecting ? "bg-muted-foreground" : "animate-pulse bg-success"}`}
              />
              AI watching
            </span>
          </div>
        ) : (
          <ExaminerPresence
            connecting={connecting}
            aiSpeaking={live.aiSpeaking}
            listening={!connecting && !live.aiSpeaking && !live.micMuted}
            userSpeaking={userIsSpeaking}
            micMuted={live.micMuted}
            paused={live.paused}
            label={mode === "viva" ? "Oral exam in progress" : "Live session"}
          />
        )}

        {/* Live indicators */}
        <div className="space-y-1.5 rounded-xl bg-secondary/40 p-2.5">
          <IndicatorRow
            icon={Sparkles}
            label="AI speaking"
            active={live.aiSpeaking}
            activeTone="text-primary"
          />
          <IndicatorRow
            icon={Ear}
            label="Listening for you"
            active={!connecting && !live.aiSpeaking && !live.micMuted}
            activeTone="text-success"
          />
          <IndicatorRow
            icon={Eye}
            label="You are speaking"
            active={userIsSpeaking}
            activeTone="text-success"
          />
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
              {networkQuality === "poor" ? (
                <WifiOff className="h-3.5 w-3.5" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              Network
            </div>
            <p
              className={`mt-1 font-semibold capitalize ${
                networkQuality === "good"
                  ? "text-success"
                  : networkQuality === "poor"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {networkQuality === "checking" ? "Connecting" : networkQuality}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {remainingSec != null ? "Time left" : "Time"}
            </div>
            <p
              className={`mt-1 font-mono font-semibold tabular-nums ${
                clockUrgent ? "text-destructive" : ""
              }`}
            >
              {primaryClock}
            </p>
            {remainingSec != null && (
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {elapsedLabel} elapsed
              </p>
            )}
          </div>
        </div>

        {/* Progress against the clock, plus the question count so far. */}
        <div className="rounded-xl bg-secondary/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Questions asked</span>
            <span className="font-semibold">
              {qaItems.length || "—"}
              <span className="ml-0.5 font-normal text-muted-foreground">
                / ~{expectedQuestions}
              </span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {live.durationSec != null ? "Time used" : "Session progress"}
            </span>
            <span className={`font-semibold ${overtime ? "text-warning" : ""}`}>
              {progressPct}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${
                overtime ? "bg-warning" : clockUrgent ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {live.durationSec != null && (
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              {Math.round(live.durationSec / 60)}-minute session. The examiner is pacing for about{" "}
              {expectedQuestions} questions and wraps up when the time is gone.
            </p>
          )}
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-xs font-semibold hover:bg-secondary/80"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
            <button
              type="button"
              onClick={() => live.togglePause()}
              disabled={connecting || live.status === "error"}
              aria-label={live.paused ? "Resume session" : "Pause session"}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold disabled:opacity-50 ${
                live.paused
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              }`}
            >
              {live.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {live.paused ? "Resume" : "Pause"}
            </button>
          </div>
          {fullscreenError && <p className="text-[11px] text-destructive">{fullscreenError}</p>}
          <button
            onClick={onEnd}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
          >
            <X className="h-4 w-4" /> End &amp; report
          </button>
        </div>
      </aside>

      {/* ============================ CENTER PANE ============================ */}
      <main
        className={`${
          mobilePane === "chat" ? "flex" : "hidden"
        } min-h-0 min-w-0 flex-1 flex-col lg:flex`}
      >
        <div className="relative min-h-0 flex-1">
          <div
            ref={transcriptRef}
            onScroll={handleTranscriptScroll}
            className="h-full space-y-3 overflow-y-auto px-6 py-5"
          >
            {live.captions.length === 0 && !live.liveAiText && !live.liveUserText ? (
              <div className="grid h-full place-items-center">
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {connecting
                    ? "Connecting to the examiner…"
                    : "The examiner will greet you shortly. Start speaking when you're ready."}
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
              <Turn key={i} role={c.role === "student" ? "student" : "examiner"} text={c.text} />
            ))}
            {live.liveUserText && <Turn role="student" text={live.liveUserText} interim />}
            {live.liveAiText && <Turn role="examiner" text={live.liveAiText} interim />}
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
                  <p className="text-sm font-medium text-destructive">
                    {live.error || "The live connection failed."}
                  </p>
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
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229)
                submitText();
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
      <aside
        className={`${
          mobilePane === "insights" ? "flex" : "hidden"
        } min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border-border bg-card/40 p-4 lg:flex lg:w-96 lg:border-l`}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {MODE_EVAL_LABEL[mode] ?? "Live evaluation"}
        </h2>

        {currentQuestion ? (
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MessageCircleQuestion className="h-3.5 w-3.5 text-warning" />{" "}
                {MODE_QUESTION_LABEL[mode] ?? "Current question"}
              </span>
              {currentQuestion.score != null ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${scoreChip(currentQuestion.score)}`}
                >
                  {currentQuestion.score}
                  <span className="text-[10px] font-medium opacity-70">/100</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Evaluating…
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium leading-snug">
              {plainText(currentQuestion.question)}
            </p>
            {currentQuestion.feedback && (
              <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                {plainText(currentQuestion.feedback)}
              </p>
            )}
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
                <ul className="mt-2 space-y-2 text-xs leading-relaxed">
                  {strengths.map((s) => (
                    <li key={s.id} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" />
                      <span>{plainText(s.text)}</span>
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
                <ul className="mt-2 space-y-2 text-xs leading-relaxed">
                  {weaknesses.map((w) => (
                    <li key={w.id} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                      <span>{plainText(w.text)}</span>
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
                <li
                  key={t.id}
                  className="rounded-lg border-l-2 border-primary bg-secondary px-2.5 py-2 leading-relaxed"
                >
                  {plainText(t.tip ?? "")}
                </li>
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
                    trend === "up"
                      ? "text-success"
                      : trend === "down"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {trend === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : trend === "down" ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                  {trend === "up" ? "Improving" : trend === "down" ? "Slipping" : "Steady"}
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {qaItems
                .map((q, i) => ({ q, number: i + 1 }))
                .reverse()
                .map(({ q, number }) => (
                  <li
                    key={q.id}
                    className="flex items-center gap-2 rounded-lg bg-secondary px-2.5 py-2 text-xs"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      Q{number}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{plainText(q.question)}</span>
                    {q.score != null ? (
                      <span className={`shrink-0 font-semibold tabular-nums ${scoreTone(q.score)}`}>
                        {q.score}
                      </span>
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

      {/* ======================= MOBILE TAB BAR (< lg) ======================= */}
      <nav
        aria-label="Session panels"
        className="flex shrink-0 items-stretch gap-1 border-t border-border bg-card/80 p-1.5 lg:hidden"
      >
        {(
          [
            { id: "session", label: mode === "viva" ? "Session" : "Camera", icon: Video },
            { id: "chat", label: "Conversation", icon: MessageCircleQuestion },
            { id: "insights", label: "Evaluation", icon: Award },
          ] as const
        ).map((tab) => {
          const active = mobilePane === tab.id;
          const Icon = tab.icon;
          // Unanswered questions are the reason to look at the Evaluation tab,
          // so surface the count rather than making the student go and check.
          const badge = tab.id === "insights" ? qaItems.length : 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobilePane(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
                active ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {badge > 0 && !active && (
                <span className="absolute right-2 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
