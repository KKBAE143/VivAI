import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mic, Sparkles, Play, TrendingUp } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateVivaSession, useVivaSessions, useVivaStats } from "@/lib/hooks";

export const Route = createFileRoute("/ai-viva/")({
  head: () => ({
    meta: [
      { title: "AI Mock Viva — CollgePro Navigator" },
      {
        name: "description",
        content:
          "Practice viva questions with AI in English, Hindi or Hinglish. Get instant scoring and tips.",
      },
    ],
  }),
  component: AiVivaHub,
});

function AiVivaHub() {
  useRequireAuth();
  const sessionsQuery = useVivaSessions();
  const statsQuery = useVivaStats();
  const createSession = useCreateVivaSession();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSubject, setQuickSubject] = useState("");
  const [quickLanguage, setQuickLanguage] = useState("English");

  const sessions = sessionsQuery.data ?? [];
  const stats = statsQuery.data;
  const totalQuestions = sessions.reduce((sum, s) => sum + Number(s.total_questions ?? 0), 0);
  const topSubject = stats?.strengths?.[0]?.topic ?? "—";
  const scoreBars = sessions
    .filter((s) => s.score != null)
    .slice(0, 7)
    .map((s) => Number(s.score))
    .reverse();

  const quickViva = async () => {
    setError("");
    try {
      const subject = quickSubject.trim();
      const res = await createSession.mutateAsync({
        // If they named a subject it's a focused Subject viva; otherwise a
        // general technical interview (the examiner will ask their branch/topic).
        session_type: subject ? "Subject" : "General",
        duration_minutes: 5,
        difficulty: "Medium",
        language: quickLanguage,
        subject: subject || undefined,
      });
      navigate({ to: "/ai-viva/session/$id", params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="AI Mock Viva"
        subtitle="Practice oral exams, get instant scoring and improvement tips."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7 bg-primary text-primary-foreground">
          <div className="flex items-center justify-between">
            <Badge tone="muted">
              <span className="text-primary">AI Powered</span>
            </Badge>
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight">Begin a new mock viva</h2>
          <p className="mt-2 max-w-md text-sm text-primary-foreground/90">
            Pick a subject or project, set difficulty, and start answering. Voice or text — your
            call.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/ai-viva/new"
              className="flex items-center gap-2 rounded-xl bg-primary-foreground px-5 py-3 text-sm font-semibold text-primary"
            >
              <Mic className="h-4 w-4" /> Configure Session
            </Link>
            <button
              onClick={() => setQuickOpen((v) => !v)}
              aria-expanded={quickOpen}
              className="flex items-center gap-2 rounded-xl bg-primary-foreground/15 px-5 py-3 text-sm font-medium"
            >
              <Play className="h-4 w-4" /> Quick 5-min Viva
            </button>
          </div>

          {quickOpen && (
            <div className="mt-4 rounded-xl bg-primary-foreground/10 p-4">
              <label className="text-xs font-medium text-primary-foreground/90">
                What subject or topics should the examiner test you on?
              </label>
              <input
                value={quickSubject}
                onChange={(e) => setQuickSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229)
                    void quickViva();
                }}
                autoFocus
                placeholder="e.g. DBMS & Operating Systems (leave blank for a general interview)"
                className="mt-2 w-full rounded-lg bg-primary-foreground px-3.5 py-2.5 text-sm text-primary placeholder:text-primary/50 focus:outline-none"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-primary-foreground/80">Language:</span>
                {["English", "Hindi", "Hinglish"].map((l) => (
                  <button
                    key={l}
                    onClick={() => setQuickLanguage(l)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      quickLanguage === l
                        ? "bg-primary-foreground text-primary"
                        : "bg-primary-foreground/15 text-primary-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
                <button
                  disabled={createSession.isPending}
                  onClick={() => void quickViva()}
                  className="ml-auto flex items-center gap-2 rounded-lg bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" />
                  {createSession.isPending ? "Starting…" : "Start viva"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </Card>
        {statsQuery.isLoading ? (
          <CardSkeleton className="lg:col-span-5 h-64" />
        ) : (
          <Card className="lg:col-span-5">
            <h3 className="text-base font-semibold">Performance Snapshot</h3>
            <div className="mt-5 flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold tracking-tight">
                  {stats?.avg_score != null ? `${stats.avg_score}%` : "—"}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs font-medium text-success">
                  <TrendingUp className="h-3 w-3" /> {stats?.completed_sessions ?? 0} completed
                </div>
              </div>
              <div className="flex h-20 items-end gap-1">
                {(scoreBars.length ? scoreBars : [0]).map((v, i) => (
                  <div
                    key={i}
                    className="w-3 rounded-t bg-primary"
                    style={{ height: `${Math.max(v, 4)}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                { l: "Sessions", v: String(stats?.total_sessions ?? 0) },
                { l: "Questions", v: String(totalQuestions) },
                { l: "Top Subject", v: String(topSubject) },
              ].map((s) => (
                <div key={s.l} className="rounded-xl bg-secondary p-3">
                  <div className="truncate text-base font-bold">{s.v}</div>
                  <div className="text-[11px] text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <Card>
        <h3 className="text-base font-semibold">Recent Sessions</h3>
        {sessionsQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading sessions…</p>
        ) : sessionsQuery.error ? (
          <ErrorState
            message={
              sessionsQuery.error instanceof Error
                ? sessionsQuery.error.message
                : "Could not load sessions"
            }
            onRetry={() => void sessionsQuery.refetch()}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Configure your first mock viva above to start practicing."
          />
        ) : (
          <div className="mt-4 divide-y divide-border">
            {sessions.map((s) => {
              const score = s.score == null ? null : Number(s.score);
              const title = String(s.subject ?? `${String(s.session_type ?? "General")} Viva`);
              return (
                <div
                  key={String(s.id)}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {String(s.created_at ?? "").slice(0, 10)} ·{" "}
                      {String(s.duration_minutes ?? "—")} min
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {score !== null ? (
                      <Badge tone={score >= 80 ? "success" : "warning"}>{score}%</Badge>
                    ) : (
                      <Badge tone="muted">{String(s.status ?? "Pending")}</Badge>
                    )}
                    <Link
                      to="/ai-viva/session/$id"
                      params={{ id: String(s.id) }}
                      className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium"
                    >
                      {s.status === "Completed" ? "Review" : "Resume"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
