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
} from "lucide-react";

import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { useRequireAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/hooks";
import { useEvaluatePitch, type PitchResult } from "@/lib/hooks-features";
import { useSpeechToText } from "@/lib/speech";
import { LiveSessionRunner } from "@/components/live/live-session-runner";

export const Route = createFileRoute("/pitch-drill")({
  head: () => ({ meta: [{ title: "90-Second Pitch Drill — VivAI" }] }),
  component: PitchDrillPage,
});

const TARGET = 90;

function PitchDrillPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const projects = useProjects();
  const evaluate = useEvaluatePitch();
  const speech = useSpeechToText("English");

  const [projectId, setProjectId] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [mode, setMode] = useState<"live" | "classic">("live");
  const [liveActive, setLiveActive] = useState(false);
  const [liveSessionId] = useState(() => `pitch-${Date.now()}`);
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

  if (!authLoading && !ready) return null;

  // ----- Live AI coach mode -----
  if (liveActive) {
    return (
      <LiveSessionRunner
        mode="pitch"
        sessionId={liveSessionId}
        projectId={projectId || null}
        subject={topic.trim() || null}
        title="Live Pitch Coach"
        subtitle="Deliver your 90-second pitch — your coach reacts and coaches you in real time."
        defaultLanguage="English"
        sources={["none"]}
        onEnded={() => setLiveActive(false)}
      />
    );
  }

  const overtime = elapsed > TARGET;
  const ringPct = Math.min(100, (elapsed / TARGET) * 100);

  return (
    <AppShell>
      <PageHeader
        title="90-Second Pitch Drill"
        subtitle="Examiners judge your first 90 seconds. Practice a crisp pitch: problem, approach, tech, impact."
      />

      <div className="mb-5 inline-flex rounded-xl bg-secondary p-1 text-sm font-medium">
        <button
          onClick={() => setMode("live")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
            mode === "live"
              ? "bg-background text-foreground shadow-[var(--shadow-card)]"
              : "text-muted-foreground"
          }`}
        >
          <Radio className="h-4 w-4" /> Live AI Coach
        </button>
        <button
          onClick={() => setMode("classic")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
            mode === "classic"
              ? "bg-background text-foreground shadow-[var(--shadow-card)]"
              : "text-muted-foreground"
          }`}
        >
          <Clock className="h-4 w-4" /> Timed Drill
        </button>
      </div>

      {mode === "live" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="flex flex-col items-center justify-center gap-5 py-12 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Radio className="h-9 w-9" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Real-time pitch coaching</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Speak your pitch naturally. Your AI coach listens live, reacts as you go, and asks
                follow-up questions — just like a real panel. You&apos;ll get a full breakdown at
                the end.
              </p>
            </div>
            <button
              onClick={() => setLiveActive(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
            >
              <Play className="h-4 w-4" /> Start live pitch
            </button>
          </Card>
          <div className="space-y-5">
            <Card>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project (optional)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">General pitch</option>
                {(projects.data ?? []).map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.title)}
                  </option>
                ))}
              </select>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What are you pitching? (optional)
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                placeholder="e.g. An AI study-planner app for engineering students preparing for placements."
                className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus:border-primary focus:outline-none"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Aim to cover:{" "}
                <span className="font-medium text-foreground">problem, approach, tech, impact</span>
                .
              </p>
            </Card>
          </div>
        </div>
      )}

      {mode === "classic" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="flex flex-col items-center justify-center gap-6 py-10">
            <div className="relative grid h-48 w-48 place-items-center">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  className="fill-none stroke-secondary"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  className={`fill-none ${overtime ? "stroke-destructive" : "stroke-primary"} transition-all`}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - ringPct / 100)}`}
                />
              </svg>
              <div className="absolute text-center">
                <div
                  className={`text-4xl font-bold tabular-nums ${overtime ? "text-destructive" : "text-foreground"}`}
                >
                  {formatTime(elapsed)}
                </div>
                <div className="text-xs text-muted-foreground">of {formatTime(TARGET)}</div>
              </div>
            </div>

            {!speech.supported && (
              <p className="max-w-sm text-center text-xs text-warning">
                Speech recognition isn&apos;t supported in this browser. Try Chrome for mic capture.
              </p>
            )}

            <div className="flex items-center gap-3">
              {phase === "idle" && (
                <button
                  onClick={start}
                  disabled={!speech.supported}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Play className="h-4 w-4" /> Start Pitch
                </button>
              )}
              {phase === "recording" && (
                <button
                  onClick={submit}
                  className="inline-flex items-center gap-2 rounded-xl bg-destructive px-6 py-3 text-sm font-semibold text-destructive-foreground"
                >
                  <MicOff className="h-4 w-4" /> Stop &amp; Score
                </button>
              )}
              {phase === "done" && !result && (
                <button
                  onClick={submit}
                  disabled={evaluate.isPending || !transcript}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
                  className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold"
                >
                  <RotateCcw className="h-4 w-4" /> Reset
                </button>
              )}
            </div>

            {phase === "recording" && (
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> Listening…
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project (optional)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={phase !== "idle"}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">General pitch</option>
                {(projects.data ?? []).map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.title)}
                  </option>
                ))}
              </select>
              <p className="mt-3 text-xs text-muted-foreground">
                Aim to cover:{" "}
                <span className="font-medium text-foreground">problem, approach, tech, impact</span>{" "}
                — all within 90 seconds.
              </p>
            </Card>

            {transcript && (
              <Card>
                <h3 className="text-sm font-semibold">Transcript</h3>
                <p className="mt-2 max-h-40 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
                  {transcript}
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {mode === "classic" && result && <PitchReport result={result} />}
    </AppShell>
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
