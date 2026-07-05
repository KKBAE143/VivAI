import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Mic,
  Briefcase,
  GraduationCap,
  Presentation,
  Users,
  Rocket,
  Podcast,
  MessagesSquare,
  Loader2,
  ArrowLeft,
} from "lucide-react";

import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { useRequireAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { LIVE_LANGUAGES } from "@/lib/languages";
import { LiveSessionRunner } from "@/components/live/live-session-runner";
import { usePresentationSession } from "@/lib/hooks";

export const Route = createFileRoute("/advanced/sentiment-analysis")({
  head: () => ({ meta: [{ title: "AI Communication Coach — VivAI" }] }),
  component: CommunicationCoach,
});

/** Scenarios the AI coach can role-play. `value` is sent to the live engine. */
const SCENARIOS = [
  { value: "Interview", label: "Interview", desc: "AI acts as the interviewer.", icon: Briefcase },
  { value: "Viva", label: "Viva", desc: "AI behaves like an examiner.", icon: GraduationCap },
  { value: "Project Presentation", label: "Project Presentation", desc: "AI acts as faculty.", icon: Presentation },
  { value: "Group Discussion", label: "Group Discussion", desc: "AI facilitates and probes.", icon: Users },
  { value: "Pitch", label: "Pitch", desc: "AI behaves like an investor.", icon: Rocket },
  { value: "Seminar", label: "Seminar", desc: "AI is a curious audience.", icon: Podcast },
  { value: "Public Speaking", label: "Public Speaking", desc: "AI coaches your delivery.", icon: MessagesSquare },
] as const;

type Phase = "pick" | "live" | "report";

function CommunicationCoach() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const [phase, setPhase] = useState<Phase>("pick");
  const [scenario, setScenario] = useState<string>("Interview");
  const [language, setLanguage] = useState<string>("English");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const startSession = async () => {
    setError("");
    setStarting(true);
    try {
      const session = await api<{ id: string }>("/api/presentation/sessions", {
        body: { session_type: "Coach", subject: scenario, duration_minutes: 10 },
      });
      setSessionId(session.id);
      setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  if (!authLoading && !ready) return null;

  // ---------- Live phase: reuse the shared real-time engine ----------
  if (phase === "live" && sessionId) {
    return (
      <div className="min-h-screen bg-background">
        <LiveSessionRunner
          mode="coach"
          sessionId={sessionId}
          subject={scenario}
          title={`${scenario} — Communication Coach`}
          subtitle="Speak naturally to the camera — your AI coach is watching and coaching live."
          defaultLanguage={language}
          showPersona
          sources={["camera"]}
          onEnded={() => setPhase("report")}
        />
      </div>
    );
  }

  // ---------- Report phase ----------
  if (phase === "report" && sessionId) {
    return <CoachReport sessionId={sessionId} onDone={() => resetToPick()} />;
  }

  function resetToPick() {
    setSessionId(null);
    setPhase("pick");
  }

  // ---------- Scenario picker ----------
  return (
    <AppShell>
      <PageHeader
        title="AI Communication Coach"
        subtitle="Pick a scenario and practice live. The AI role-plays, watches you on camera, and coaches your delivery in real time — then gives you a full report."
      />

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          1. Choose a scenario
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const active = scenario === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setScenario(s.value)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary hover:border-primary/50"
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                    active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="rounded-xl bg-secondary px-4 py-3">
            <span className="text-xs text-muted-foreground">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-lg bg-card px-2 py-2 text-sm font-semibold focus:outline-none"
            >
              {LIVE_LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <button
          onClick={() => void startSession()}
          disabled={starting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {starting ? "Starting…" : `Start ${scenario} practice`}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          Next you&apos;ll do a quick camera + mic check, then go live with your coach.
        </p>
      </Card>
    </AppShell>
  );
}

function Meter({ label, value }: { label: string; value: number | null | undefined }) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)));
  const tone = v < 45 ? "bg-destructive" : v < 70 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value == null ? "—" : v}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded bg-muted">
        <div className={`h-2 rounded ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

interface CoachState {
  subject?: string | null;
  report?: {
    coach_metrics?: Record<string, number>;
    recommendations?: string[];
    strengths?: string[];
    weaknesses?: string[];
  };
}

function CoachReport({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { data: session, isLoading } = usePresentationSession(sessionId);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Preparing your communication report…
      </div>
    );
  }

  const state = (session?.topic_scores as CoachState | undefined) ?? {};
  const scenario = state.subject ?? "Communication";
  const report = state.report ?? {};
  const metrics = report.coach_metrics ?? {};
  const recommendations = report.recommendations ?? [];
  const strengths = report.strengths ?? [];
  const weaknesses = report.weaknesses ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{scenario} — Coaching Report</div>
            <div className="text-xs text-muted-foreground">AI Communication Coach</div>
          </div>
          <button
            onClick={onDone}
            className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" /> New session
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Overall", session?.overall_score],
            ["Confidence", metrics.confidence ?? session?.confidence_score],
            ["Communication", metrics.communication],
            ["Clarity", metrics.clarity ?? session?.clarity_score],
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

        <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold">Delivery breakdown</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Meter label="Confidence" value={metrics.confidence} />
            <Meter label="Communication" value={metrics.communication} />
            <Meter label="Clarity" value={metrics.clarity} />
            <Meter label="Engagement" value={metrics.engagement} />
          </div>
        </div>

        {session?.feedback_summary ? (
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Coach summary</h3>
            <p className="mt-2 text-sm leading-relaxed">{String(session.feedback_summary)}</p>
          </div>
        ) : null}

        {(strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {strengths.length > 0 && (
              <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                <h3 className="text-sm font-semibold text-success">Strengths</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {strengths.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-success">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                <h3 className="text-sm font-semibold text-warning">Areas to improve</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {weaknesses.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-warning">!</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Actionable recommendations</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {recommendations.map((r, i) => (
                <li key={i} className="rounded-xl bg-secondary p-3">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
