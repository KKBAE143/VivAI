import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mic, Sparkles, Play, TrendingUp } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateVivaSession, useVivaSessions, useVivaStats } from "@/lib/hooks";

export const Route = createFileRoute("/ai-viva/")({
  head: () => ({
    meta: [
      { title: "AI Mock Viva — VivAI" },
      {
        name: "description",
        content:
          "Practice viva questions with AI in English, Hindi or Hinglish. Get instant scoring and tips.",
      },
    ],
  }),
  component: AiVivaHub,
});

const PAGE_SIZE = 4;

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
  const [page, setPage] = useState(1);

  const sessions = sessionsQuery.data ?? [];
  const stats = statsQuery.data;
  const totalQuestions = sessions.reduce((sum, s) => sum + Number(s.total_questions ?? 0), 0);
  const topSubject = stats?.strengths?.[0]?.topic ?? "—";
  const scoreBars = sessions
    .filter((s) => s.score != null)
    .slice(0, 7)
    .map((s) => Number(s.score))
    .reverse();

  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleSessions = sessions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const quickViva = async () => {
    setError("");
    try {
      const subject = quickSubject.trim();
      const res = await createSession.mutateAsync({
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
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Compact Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              AI Mock Viva
            </h1>
            <p className="text-xs text-muted-foreground">
              Practice oral exams, get instant scoring and improvement tips.
            </p>
          </div>
        </div>

        {/* Top Hero Section */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Card className="lg:col-span-7 bg-primary text-primary-foreground p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <Badge tone="muted">
                  <span className="text-primary text-[11px] font-semibold">AI Powered</span>
                </Badge>
                <Sparkles className="h-4 w-4 opacity-80" />
              </div>
              <h2 className="mt-3 text-xl sm:text-2xl font-bold tracking-tight">
                Begin a new mock viva
              </h2>
              <p className="mt-1 max-w-md text-xs sm:text-sm text-primary-foreground/90 leading-relaxed">
                Pick a subject or project, set difficulty, and start answering. Voice or text — your
                call.
              </p>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Link
                to="/ai-viva/new"
                className="flex items-center gap-1.5 rounded-xl bg-primary-foreground px-4 py-2 text-xs sm:text-sm font-semibold text-primary shadow-sm hover:opacity-95"
              >
                <Mic className="h-3.5 w-3.5" /> Configure Session
              </Link>
              <button
                onClick={() => setQuickOpen((v) => !v)}
                aria-expanded={quickOpen}
                className="flex items-center gap-1.5 rounded-xl bg-primary-foreground/15 px-4 py-2 text-xs sm:text-sm font-medium text-primary-foreground hover:bg-primary-foreground/20"
              >
                <Play className="h-3.5 w-3.5" /> Quick 5-min Viva
              </button>
            </div>

            {quickOpen && (
              <div className="mt-3 rounded-xl bg-primary-foreground/10 p-3">
                <label className="text-[11px] font-medium text-primary-foreground/90">
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
                  placeholder="e.g. DBMS & Operating Systems (leave blank for general)"
                  className="mt-1.5 w-full rounded-lg bg-primary-foreground px-3 py-1.5 text-xs sm:text-sm text-primary placeholder:text-primary/50 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-primary-foreground/80">Language:</span>
                  {["English", "Hindi", "Hinglish"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setQuickLanguage(l)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
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
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary-foreground px-3 py-1 text-xs font-semibold text-primary disabled:opacity-60"
                  >
                    <Play className="h-3 w-3" />
                    {createSession.isPending ? "Starting…" : "Start viva"}
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </Card>

          {statsQuery.isLoading ? (
            <CardSkeleton className="lg:col-span-5 h-44" />
          ) : (
            <Card className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between">
              <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Performance Snapshot
              </h3>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold tracking-tight text-foreground">
                    {stats?.avg_score != null ? `${stats.avg_score}%` : "—"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-success">
                    <TrendingUp className="h-3 w-3" /> {stats?.completed_sessions ?? 0} completed
                  </div>
                </div>
                <div className="flex h-12 items-end gap-1">
                  {(scoreBars.length ? scoreBars : [0]).map((v, i) => (
                    <div
                      key={i}
                      className="w-2.5 rounded-t bg-primary"
                      style={{ height: `${Math.max(v, 6)}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                {[
                  { l: "Sessions", v: String(stats?.total_sessions ?? 0) },
                  { l: "Questions", v: String(totalQuestions) },
                  { l: "Top Subject", v: String(topSubject) },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg bg-secondary p-2">
                    <div className="truncate text-xs sm:text-sm font-bold">{s.v}</div>
                    <div className="text-[10px] text-muted-foreground">{s.l}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Recent Sessions */}
        <Card className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent Sessions</h3>
              {sessions.length > 0 && <Badge tone="muted">{sessions.length} total</Badge>}
            </div>
            {sessionsQuery.isLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Loading sessions…</p>
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
              <div className="mt-2.5 divide-y divide-border">
                {visibleSessions.map((s) => {
                  const score = s.score == null ? null : Number(s.score);
                  const title = String(s.subject ?? `${String(s.session_type ?? "General")} Viva`);
                  return (
                    <div
                      key={String(s.id)}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs sm:text-sm font-semibold">{title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {String(s.created_at ?? "").slice(0, 10)} ·{" "}
                          {String(s.duration_minutes ?? "—")} min
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {score !== null ? (
                          <Badge tone={score >= 80 ? "success" : "warning"}>{score}%</Badge>
                        ) : (
                          <Badge tone="muted">{String(s.status ?? "Pending")}</Badge>
                        )}
                        <Link
                          to="/ai-viva/session/$id"
                          params={{ id: String(s.id) }}
                          className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-secondary/80"
                        >
                          {s.status === "Completed" ? "Review" : "Resume"}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {sessions.length > 0 && (
            <DataPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={sessions.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="sessions"
              className="mt-2 pt-2"
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
