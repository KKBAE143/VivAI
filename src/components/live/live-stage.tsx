/**
 * LiveStage — the real-time session surface. Renders the shared video, the AI's
 * live speaking/listening state, a rolling transcript, and a feed of structured
 * moments (commentary, questions, scores) as the examiner reacts in real time.
 */
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import type { useLiveSession } from "@/lib/useLiveSession";

type LiveHook = ReturnType<typeof useLiveSession>;

interface LiveStageProps {
  live: LiveHook;
  videoStream: MediaStream | null;
  title: string;
  subtitle?: string;
  onEnd: () => void;
}

const EVENT_META = {
  flag: { icon: Sparkles, tone: "text-primary", label: "Observation" },
  question: { icon: MessageCircleQuestion, tone: "text-warning", label: "Question" },
  score: { icon: Award, tone: "text-success", label: "Score" },
} as const;

export function LiveStage({ live, videoStream, title, subtitle, onEnd }: LiveStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  // Autoscroll transcript.
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [live.captions, live.liveUserText, live.liveAiText]);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
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
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <main className="space-y-4">
          {/* Video / stage */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-foreground/5">
            {videoStream ? (
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full bg-foreground/5"
              />
            ) : (
              <div className="grid aspect-video w-full place-items-center">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div
                    className={`grid h-20 w-20 place-items-center rounded-full transition-transform ${
                      live.aiSpeaking ? "scale-110 bg-primary/20" : "bg-secondary"
                    }`}
                  >
                    <Sparkles
                      className={`h-9 w-9 ${live.aiSpeaking ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Audio-only session — just talk.</p>
                </div>
              </div>
            )}
            {connecting && (
              <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting to the live examiner…
                </div>
              </div>
            )}
            {videoStream && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold backdrop-blur">
                <span
                  className={`h-2 w-2 rounded-full ${connecting ? "bg-muted-foreground" : "bg-success"} ${!connecting ? "animate-pulse" : ""}`}
                />
                AI is watching
              </span>
            )}
          </div>

          {/* Live transcript */}
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live conversation
            </h3>
            <div ref={transcriptRef} className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              {live.captions.length === 0 && !live.liveAiText && !live.liveUserText ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  The examiner will greet you shortly. Start speaking when you&apos;re ready.
                </p>
              ) : null}
              {live.captions.map((c, i) => (
                <div
                  key={i}
                  className={`flex ${c.role === "student" ? "justify-end" : "justify-start"}`}
                >
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

            {/* Text fallback */}
            <div className="mt-3 flex items-center gap-2">
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

          {live.status === "error" && live.error && (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {live.error}
            </p>
          )}
        </main>

        {/* Live insights feed */}
        <aside className="space-y-3">
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live feedback
            </h3>
            <div className="mt-3 space-y-2">
              {live.events.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Commentary, questions and scores appear here as the examiner reacts.
                </p>
              ) : (
                [...live.events].reverse().map((ev) => {
                  const meta = EVENT_META[ev.kind];
                  const Icon = meta.icon;
                  return (
                    <div key={ev.id} className="flex gap-2.5 rounded-xl bg-secondary px-3 py-2.5">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {meta.label}
                          </span>
                          {ev.kind === "score" && ev.score != null && (
                            <span
                              className={`text-xs font-bold ${ev.score >= 60 ? "text-success" : "text-warning"}`}
                            >
                              {ev.score}/100
                            </span>
                          )}
                          {ev.topic && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              · {ev.topic}
                            </span>
                          )}
                        </div>
                        {ev.text && <p className="mt-0.5 text-sm leading-snug">{ev.text}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
