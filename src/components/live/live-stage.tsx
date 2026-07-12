/**
 * LiveStage — the real-time session surface. A fixed-viewport desktop
 * workspace: the page itself never scrolls, only the transcript and the
 * feedback panel do, each independently, so the latest message and the
 * latest coaching moment are always visible without hunting for them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  X,
  Radio,
  Send,
  Sparkles,
  MessageCircleQuestion,
  Award,
  Loader2,
  Clock,
} from "lucide-react";
import type { useLiveSession, LiveEvent } from "@/lib/useLiveSession";

type LiveHook = ReturnType<typeof useLiveSession>;

interface LiveStageProps {
  live: LiveHook;
  videoStream: MediaStream | null;
  title: string;
  subtitle?: string;
  onEnd: () => void;
  /** Called when the student wants to retry after a connection failure. */
  onRetry?: () => void;
}

const CUE_META = {
  flag: { icon: Sparkles, tone: "text-primary", label: "Observation" },
  observation: { icon: Sparkles, tone: "text-primary", label: "Coach cue" },
} as const;

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

function QACard({ item }: { item: QAItem }) {
  const scored = item.score != null;
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{item.topic || "Question"}</span>
        </div>
        {scored ? (
          <span className={`shrink-0 text-xs font-bold ${item.score! >= 60 ? "text-success" : "text-warning"}`}>
            {item.score}/100
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Awaiting answer
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-snug">{item.question}</p>
      {item.feedback && <p className="mt-1.5 text-xs leading-snug text-primary">{item.feedback}</p>}
    </div>
  );
}

export function LiveStage({ live, videoStream, title, subtitle, onEnd, onRetry }: LiveStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  // Autoscroll transcript — the only element that scrolls in the main pane.
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [live.captions, live.liveUserText, live.liveAiText]);

  const qaItems = useMemo(() => groupQuestionsAndScores(live.events), [live.events]);
  const coachingCues = useMemo(
    () => live.events.filter((ev) => ev.kind === "observation" || ev.kind === "flag"),
    [live.events],
  );

  const connecting = live.status === "connecting" || live.status === "idle";

  const statusPill = (() => {
    if (live.status === "error")
      return { text: "Connection issue", cls: "bg-destructive/15 text-destructive" };
    if (connecting) return { text: "Connecting…", cls: "bg-secondary text-muted-foreground" };
    if (live.aiSpeaking) return { text: "AI speaking", cls: "bg-primary/15 text-primary" };
    return { text: "Listening", cls: "bg-success/15 text-success" };
  })();

  const submitText = () => {
    if (!text.trim()) return;
    live.pushText(text.trim());
    setText("");
  };

  // Voice-visualizer state for audio-only sessions.
  const eqActive = !connecting && (live.aiSpeaking || live.status === "live") && !live.micMuted;
  const stageLabel = connecting
    ? "Connecting to the examiner…"
    : live.status === "error"
      ? "Connection lost"
      : live.aiSpeaking
        ? "VivAI is speaking"
        : live.micMuted
          ? "Microphone muted"
          : "Listening — your turn";
  const stageHint = live.micMuted
    ? "Unmute your mic to answer out loud."
    : live.aiSpeaking
      ? "You can jump in any time — just start speaking to respond."
      : "Answer naturally out loud. The examiner hears you in real time.";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background lg:h-dvh">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusPill.cls}`}
          >
            <Radio className="h-3.5 w-3.5" /> {statusPill.text}
          </span>
          <button
            onClick={live.toggleMic}
            aria-label={live.micMuted ? "Unmute microphone" : "Mute microphone"}
            className={`grid h-9 w-9 place-items-center rounded-xl ${
              live.micMuted ? "bg-destructive text-destructive-foreground" : "bg-secondary"
            }`}
          >
            {live.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={onEnd}
            className="flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
          >
            <X className="h-4 w-4" /> End &amp; report
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_360px] lg:overflow-hidden">
        <main className="flex min-h-0 flex-col gap-3 p-4 lg:overflow-hidden">
          {/* Stage — a full video surface for screen-share modes, or a
              compact voice status bar for audio-only modes so the transcript
              gets nearly all the vertical space instead of sitting under a
              large decorative card. */}
          {videoStream ? (
            <div className="relative shrink-0 overflow-hidden rounded-2xl border border-border bg-foreground/5">
              <video
                ref={videoRef}
                muted
                playsInline
                className="max-h-[38vh] w-full bg-foreground/5 object-cover lg:max-h-[42vh]"
              />
              {connecting && (
                <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" /> Connecting to the live examiner…
                  </div>
                </div>
              )}
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold backdrop-blur">
                <span
                  className={`h-2 w-2 rounded-full ${connecting ? "bg-muted-foreground" : "bg-success"} ${!connecting ? "animate-pulse" : ""}`}
                />
                AI is watching
              </span>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-border bg-gradient-to-r from-secondary/50 to-card px-4 py-3">
              {/* Compact voice orb — audio-only sessions don't need a tall card. */}
              <div className="relative grid shrink-0 place-items-center">
                {live.aiSpeaking && (
                  <span className="absolute h-12 w-12 animate-ping rounded-full bg-primary/20" />
                )}
                <div
                  className={`relative grid h-11 w-11 place-items-center rounded-full transition-all duration-300 ${
                    live.aiSpeaking
                      ? "scale-105 bg-primary text-primary-foreground"
                      : live.micMuted
                        ? "bg-secondary text-muted-foreground"
                        : "bg-success/15 text-success"
                  }`}
                >
                  {live.micMuted ? (
                    <MicOff className="h-5 w-5" />
                  ) : live.aiSpeaking ? (
                    <Sparkles className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {stageLabel}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{stageHint}</p>
              </div>
              <div className="flex h-6 shrink-0 items-end gap-1" aria-hidden="true">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    className={`viv-eq-bar w-1 rounded-full ${
                      live.aiSpeaking ? "bg-primary" : live.micMuted ? "bg-muted-foreground" : "bg-success"
                    }`}
                    style={{
                      height: "100%",
                      animationDelay: `${i * 0.11}s`,
                      animationPlayState: eqActive ? "running" : "paused",
                      opacity: eqActive ? 1 : 0.35,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live transcript — the ONLY element in the main pane that scrolls. */}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live conversation
            </h3>
            <div ref={transcriptRef} className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {live.captions.length === 0 && !live.liveAiText && !live.liveUserText ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  The examiner will greet you shortly. Start speaking when you&apos;re ready.
                </p>
              ) : null}
              {live.captions.map((c, i) => (
                <div key={i} className={`flex ${c.role === "student" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      c.role === "student"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {c.text}
                  </div>
                </div>
              ))}
              {live.liveUserText && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary/60 px-3.5 py-2 text-sm text-primary-foreground">
                    {live.liveUserText}
                  </div>
                </div>
              )}
              {live.liveAiText && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl bg-secondary/70 px-3.5 py-2 text-sm italic">
                    {live.liveAiText}
                  </div>
                </div>
              )}
            </div>

            {/* Text fallback — pinned at the bottom of the main pane. */}
            <div className="mt-3 flex shrink-0 items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229)
                    submitText();
                }}
                placeholder="Type instead of speaking…"
                className="flex-1 rounded-xl bg-secondary px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={submitText}
                aria-label="Send message"
                className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {live.status === "error" && (
            <div className="shrink-0 rounded-xl bg-destructive/10 px-4 py-4">
              <p className="text-sm font-medium text-destructive">
                {live.error || "The live connection failed."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing was recorded — your session isn&apos;t marked as completed. You can retry
                right away.
              </p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Retry session
                </button>
              )}
            </div>
          )}
        </main>

        {/* Live insights panel — independently scrollable, so a long feed
            never pushes the page (or the transcript) around. */}
        <aside className="flex min-h-0 flex-col gap-3 border-t border-border bg-card/40 p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
          {qaItems.length > 0 && (
            <div className="shrink-0 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Questions &amp; answers
              </h3>
              <div className="mt-3 space-y-2">
                {qaItems.map((item) => (
                  <QACard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Coaching cues
            </h3>
            <div className="mt-3 space-y-2">
              {coachingCues.length === 0 && qaItems.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Commentary, questions and scores appear here as the examiner reacts.
                </p>
              ) : coachingCues.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Delivery tips will appear here as the session continues.
                </p>
              ) : (
                [...coachingCues].reverse().map((ev) => {
                  const meta = CUE_META[ev.kind as keyof typeof CUE_META] ?? CUE_META.observation;
                  const Icon = meta.icon;
                  return (
                    <div key={ev.id} className="flex gap-2.5 rounded-xl bg-secondary px-3 py-2.5">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {meta.label}
                          </span>
                          {ev.dimension && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              · {ev.dimension.replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                        {ev.text && <p className="mt-0.5 text-sm leading-snug">{ev.text}</p>}
                        {ev.tip && <p className="mt-1 text-xs text-primary">Tip: {ev.tip}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Award icon retained for the score badges in QACard's spirit — a
              small legend so the color coding reads at a glance. */}
          {qaItems.some((q) => q.score != null) && (
            <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Award className="h-3 w-3" /> Scores update live as the examiner evaluates each answer.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
