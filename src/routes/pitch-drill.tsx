import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  RotateCcw,
  Play,
  Loader2,
  Check,
  X,
  Timer as TimerIcon,
  Radio,
  Clock,
  ArrowLeft,
  Bot,
  Languages,
} from "lucide-react";

import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequireAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { LIVE_LANGUAGES } from "@/lib/languages";
import { useProjects, usePresentationSession } from "@/lib/hooks";
import { useEvaluatePitch, type PitchResult } from "@/lib/hooks-features";
import { useSpeechToText } from "@/lib/speech";
import { LiveSessionRunner } from "@/components/live/live-session-runner";
import { SessionReport } from "@/components/reports/session-report";
import type { SessionReport as SessionReportData } from "@/lib/types";

export const Route = createFileRoute("/pitch-drill")({
  head: () => ({ meta: [{ title: "90-Second Pitch Drill — VivAI" }] }),
  component: PitchDrillPage,
});

const TARGET = 90;
const POPULAR_LANGUAGES = ["English", "Hindi", "Hinglish", "Telugu", "Tamil", "Kannada", "Bengali"];

function PitchDrillPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const projects = useProjects();
  const evaluate = useEvaluatePitch();
  const [language, setLanguage] = useState<string>("English");
  const speech = useSpeechToText(language);

  const [projectId, setProjectId] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [mode, setMode] = useState<"live" | "classic">("live");
  const [livePhase, setLivePhase] = useState<"idle" | "starting" | "live" | "report">("idle");
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveStartError, setLiveStartError] = useState("");
  const [phase, setPhase] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<PitchResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => () => stopTimer(), []);

  const transcript = useMemo(
    () => `${speech.transcript} ${speech.interim}`.trim(),
    [speech.transcript, speech.interim],
  );

  const start = () => {
    setResult(null);
    setElapsed(0);
    speech.reset();
    speech.start();
    setPhase("recording");
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= TARGET + 30) {
          stop();
          return e + 1;
        }
        return e + 1;
      });
    }, 1000);
  };

  const stop = () => {
    stopTimer();
    speech.stop();
    setPhase("done");
  };

  const submit = () => {
    stop();
    const finalTranscript = `${speech.transcript} ${speech.interim}`.trim();
    if (!finalTranscript) return;
    evaluate.mutate(
      {
        project_id: projectId || null,
        target_seconds: TARGET,
        transcript: finalTranscript,
        actual_seconds: Math.max(1, elapsed),
      },
      { onSuccess: setResult },
    );
  };

  const reset = () => {
    stopTimer();
    speech.reset();
    setElapsed(0);
    setPhase("idle");
    setResult(null);
  };

  const startLivePitch = async () => {
    setLiveStartError("");
    setLivePhase("starting");
    try {
      // A real, persisted session (mirrors the Coach flow) so the live pitch
      // can finalize an evidence-based report instead of vanishing on end.
      const session = await api<{ id: string }>("/api/presentation/sessions", {
        body: {
          session_type: "Pitch",
          scenario_id: "elevator_pitch",
          project_id: projectId || null,
          subject: topic.trim() || null,
          duration_minutes: 6,
        },
      });
      setLiveSessionId(session.id);
      setLivePhase("live");
    } catch (e) {
      setLiveStartError(
        e instanceof Error ? e.message : "Could not start the live pitch. Please try again.",
      );
      setLivePhase("idle");
    }
  };

  if (!authLoading && !ready) return null;

  // ----- Live AI coach mode -----
  if (livePhase === "live" && liveSessionId) {
    return (
      <LiveSessionRunner
        mode="pitch"
        sessionId={liveSessionId}
        projectId={projectId || null}
        subject={topic.trim() || null}
        title="Live Pitch Coach"
        subtitle="Deliver your 90-second pitch — your coach reacts and coaches you in real time."
        defaultLanguage={language}
        sources={["none"]}
        onEnded={() => setLivePhase("report")}
      />
    );
  }

  if (livePhase === "report" && liveSessionId) {
    return (
      <PitchLiveReport
        sessionId={liveSessionId}
        onDone={() => {
          setLiveSessionId(null);
          setLivePhase("idle");
        }}
      />
    );
  }

  const overtime = elapsed > TARGET;
  const ringPct = Math.min(100, (elapsed / TARGET) * 100);

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Header with Segmented Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-graphik">
                90-Second Pitch Drill
              </h1>
              <span className="apple-pill-badge py-0.5 px-2 text-[10px]">
                ELEVATOR PITCH
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Practice sharp, timed project pitches. Choose live conversational AI coaching or a timed solo drill.
            </p>
          </div>

          {/* Apple Segmented Control */}
          <div className="apple-segmented-track flex items-center p-1 text-xs font-semibold">
            <button
              onClick={() => setMode("live")}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-4 py-1.5 transition-all duration-200 cursor-pointer select-none active:scale-95 ${
                mode === "live"
                  ? "apple-glass-btn-primary text-black font-bold"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <Radio className="h-3.5 w-3.5" /> Live AI Coach
            </button>
            <button
              onClick={() => setMode("classic")}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-4 py-1.5 transition-all duration-200 cursor-pointer select-none active:scale-95 ${
                mode === "classic"
                  ? "apple-glass-btn-primary text-black font-bold"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> Timed Drill
            </button>
          </div>
        </div>

        {mode === "live" && (
          <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center apple-glass-card">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] text-black shadow-[0_0_24px_rgba(175,221,255,0.4)]">
                <Radio className="h-8 w-8 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white font-graphik">
                  Real-Time Pitch Coaching
                </h2>
                <p className="mx-auto mt-1.5 max-w-md text-xs text-white/60 leading-relaxed">
                  Speak your pitch naturally in <strong className="text-[#AFDDFF]">{language}</strong>. Your AI coach listens live, reacts as you go, and asks follow-up questions — just like a real panel.
                </p>
              </div>
              <button
                onClick={() => void startLivePitch()}
                disabled={livePhase === "starting"}
                className="mt-2 apple-glass-btn-primary inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider cursor-pointer"
              >
                {livePhase === "starting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                {livePhase === "starting" ? "Starting Coach…" : "Start Live Pitch"}
              </button>
              {liveStartError && <p className="text-xs font-mono text-rose-400">{liveStartError}</p>}
            </div>

            <div className="space-y-3 flex flex-col">
              <div className="p-4 apple-glass-card flex-1 flex flex-col justify-between">
                <div>
                  {/* Language Selector Section */}
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 font-graphik mb-1.5">
                    SPOKEN LANGUAGE
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {POPULAR_LANGUAGES.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLanguage(l)}
                        className={`min-h-[28px] px-2.5 py-0.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer active:scale-95 ${
                          language === l
                            ? "bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.35)]"
                            : "border border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>

                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/60 font-graphik">
                    PROJECT GROUNDING
                  </label>
                  <div className="mt-1.5">
                    <Select
                      value={projectId || "none"}
                      onValueChange={(v) => setProjectId(v === "none" ? "" : v)}
                    >
                      <SelectTrigger className="w-full min-h-[38px] rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-[#AFDDFF]">
                        <SelectValue placeholder="General pitch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">General pitch</SelectItem>
                        {(projects.data ?? []).map((p) => (
                          <SelectItem key={String(p.id)} value={String(p.id)}>
                            {String(p.title)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-white/60 font-graphik">
                    PITCH TOPIC
                  </label>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={3}
                    placeholder="e.g. An AI study-planner app for engineering students preparing for placements."
                    className="mt-1.5 w-full resize-none rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs text-white leading-relaxed placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]"
                  />
                </div>

                <p className="mt-3 text-[10px] text-white/40 font-mono">
                  Aim to cover: <span className="font-bold text-white">problem, approach, tech, impact</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === "classic" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col items-center justify-center gap-6 py-8 apple-glass-card">
              <div className="relative grid h-48 w-48 place-items-center">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="fill-none stroke-white/10"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className={`fill-none ${overtime ? "stroke-[#FF453A]" : "stroke-[#AFDDFF]"} transition-all drop-shadow-[0_0_8px_rgba(175,221,255,0.4)]`}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - ringPct / 100)}`}
                  />
                </svg>
                <div className="absolute text-center">
                  <div
                    className={`text-4xl font-bold tabular-nums font-graphik ${
                      overtime ? "text-[#FF453A]" : "text-white"
                    }`}
                  >
                    {formatTime(elapsed)}
                  </div>
                  <div className="text-xs text-white/50 font-mono">of {formatTime(TARGET)}</div>
                </div>
              </div>

              {!speech.supported && (
                <p className="max-w-sm text-center text-xs text-amber-400 font-mono">
                  Speech recognition isn&apos;t supported in this browser. Try Chrome for mic capture.
                </p>
              )}

              <div className="flex items-center gap-3">
                {phase === "idle" && (
                  <button
                    onClick={start}
                    disabled={!speech.supported}
                    className="apple-glass-btn-primary inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" /> Start Pitch
                  </button>
                )}
                {phase === "recording" && (
                  <button
                    onClick={submit}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-500 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-[0_0_14px_rgba(244,63,94,0.3)] hover:bg-rose-600 active:scale-95 cursor-pointer uppercase tracking-wider"
                  >
                    <MicOff className="h-4 w-4" /> Stop &amp; Score
                  </button>
                )}
                {phase === "done" && !result && (
                  <button
                    onClick={submit}
                    disabled={evaluate.isPending || !transcript}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#AFDDFF] px-6 py-2.5 text-xs sm:text-sm font-bold text-black shadow-[0_0_14px_rgba(175,221,255,0.3)] hover:bg-[#c8e8ff] active:scale-95 disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                  >
                    {evaluate.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}{" "}
                    Score my pitch
                  </button>
                )}
                {phase !== "idle" && (
                  <button
                    onClick={reset}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-white/10 active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
                )}
              </div>

              {phase === "recording" && (
                <div className="flex items-center gap-2 text-xs font-bold text-[#AFDDFF] font-mono">
                  <span className="h-2 w-2 animate-ping rounded-full bg-rose-500" /> Listening…
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                <label className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono">
                  [ PROJECT_OPTIONAL ]
                </label>
                <div className="mt-2">
                  <Select
                    value={projectId || "none"}
                    onValueChange={(v) => setProjectId(v === "none" ? "" : v)}
                    disabled={phase !== "idle"}
                  >
                    <SelectTrigger className="w-full min-h-[38px] rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-[#AFDDFF]">
                      <SelectValue placeholder="General pitch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">General pitch</SelectItem>
                      {(projects.data ?? []).map((p) => (
                        <SelectItem key={String(p.id)} value={String(p.id)}>
                          {String(p.title)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-3 text-xs text-white/50 leading-relaxed">
                  Aim to cover: <span className="font-bold text-white">problem, approach, tech, impact</span> — all within 90 seconds.
                </p>
              </div>

              {transcript && (
                <div className="rounded-2xl border border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono">
                    [ TRANSCRIPT ]
                  </h3>
                  <p className="mt-2 max-h-40 overflow-y-auto text-xs leading-relaxed text-white/80 font-mono">
                    {transcript}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "classic" && result && <PitchReport result={result} />}
      </div>
    </AppShell>
  );
}

function PitchLiveReport({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { data: session, isLoading } = usePresentationSession(sessionId);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Preparing your pitch report…
      </div>
    );
  }

  const report = session?.report as SessionReportData | null | undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Live Pitch — Report</div>
            <div className="text-xs text-muted-foreground">Live Pitch Coach</div>
          </div>
          <button
            onClick={onDone}
            className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" /> New pitch
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {report ? (
          <SessionReport report={report} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Overall", session?.overall_score],
              ["Clarity", session?.clarity_score],
              ["Confidence", session?.confidence_score],
              ["Coverage", session?.coverage_score],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-2xl bg-card p-4 text-center shadow-[var(--shadow-card)]"
              >
                <div className="text-2xl font-bold">{val == null ? "—" : `${val}%`}</div>
                <div className="text-xs text-muted-foreground">{String(label)}</div>
              </div>
            ))}
          </div>
        )}
        {session?.feedback_summary ? (
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Summary</h3>
            <p className="mt-2 text-sm leading-relaxed">{String(session.feedback_summary)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PitchReport({ result }: { result: PitchResult }) {
  const parts = [
    { label: "Clarity", value: result.clarity_score },
    { label: "Structure", value: result.structure_score },
    { label: "Timing", value: result.timing_score },
  ].filter((p) => p.value != null) as { label: string; value: number }[];
  return (
    <Card className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Your Pitch Score</h3>
        <Badge
          tone={
            result.overall_score >= 75
              ? "success"
              : result.overall_score >= 50
                ? "warning"
                : "destructive"
          }
        >
          {result.overall_score}% overall
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Bot className="h-3 w-3" />
        <span>AI-generated score and feedback</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="rounded-xl bg-secondary/50 p-4">
            <div className="text-xs text-muted-foreground">{p.label}</div>
            <div className="mt-1 text-2xl font-bold">{p.value}</div>
          </div>
        ))}
      </div>

      {(result.covered?.length || result.missing?.length) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.covered?.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success"
            >
              <Check className="h-3 w-3" /> {c}
            </span>
          ))}
          {result.missing?.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
            >
              <X className="h-3 w-3" /> {m}
            </span>
          ))}
        </div>
      )}

      {result.feedback && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{result.feedback}</p>
      )}

      {result.improved_pitch && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary-soft/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-foreground">
            <TimerIcon className="h-3.5 w-3.5" /> A tighter 90-second version
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{result.improved_pitch}</p>
        </div>
      )}
    </Card>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
