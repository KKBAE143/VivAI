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
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Compact Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-graphik">
                AI Mock Viva
              </h1>
              <span className="apple-pill-badge py-0.5 px-2 text-[10px]">ORAL DEFENSE</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Practice oral defense, get instant scoring, code questioning and improvement tips.
            </p>
          </div>
        </div>

        {/* Top Hero Section */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 shrink-0">
          <div className="lg:col-span-7 apple-glass-card p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="apple-pill-badge text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  GEMINI ENGINE
                </span>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h2 className="mt-3 text-lg sm:text-xl font-bold tracking-tight text-foreground font-graphik">
                Begin a new mock viva
              </h2>
              <p className="mt-1 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Pick a subject or project, set examiner persona, and start answering. Voice or text
                — your call.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                to="/ai-viva/new"
                className="apple-glass-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm no-underline"
              >
                <Mic className="h-4 w-4" /> Configure Session
              </Link>
              <button
                onClick={() => setQuickOpen((v) => !v)}
                aria-expanded={quickOpen}
                className="apple-glass-btn-secondary inline-flex min-h-[44px] items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" /> Quick 5-min Viva
              </button>
            </div>

            {quickOpen && (
              <div className="mt-3 rounded-2xl border border-border bg-black/5 dark:bg-black/60 p-3.5 backdrop-blur-2xl animate-fade-in shadow-xs">
                <label className="text-[11px] font-semibold text-foreground">
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
                  className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-xs"
                />
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Language:</span>
                    {["English", "Hindi", "Hinglish"].map((l) => (
                      <button
                        key={l}
                        onClick={() => setQuickLanguage(l)}
                        className={`min-h-[32px] rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          quickLanguage === l
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "border border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={createSession.isPending}
                    onClick={() => void quickViva()}
                    className="apple-glass-btn-primary inline-flex min-h-[36px] items-center gap-1.5 px-3.5 py-1.5 text-xs disabled:opacity-50 cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    {createSession.isPending ? "Starting…" : "Start Viva"}
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-rose-500 font-mono">{error}</p>}
          </div>

          {statsQuery.isLoading ? (
            <CardSkeleton className="lg:col-span-5 h-44" />
          ) : (
            <div className="lg:col-span-5 apple-glass-card p-4 sm:p-5 flex flex-col justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-graphik">
                PERFORMANCE SNAPSHOT
              </h3>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold tracking-tight text-foreground font-graphik">
                    {stats?.avg_score != null ? `${stats.avg_score}%` : "—"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-[#7CE4BA]">
                    <TrendingUp className="h-3 w-3" /> {stats?.completed_sessions ?? 0} completed
                  </div>
                </div>
                <div className="flex h-12 items-end gap-1.5">
                  {(scoreBars.length ? scoreBars : [0]).map((v, i) => (
                    <div
                      key={i}
                      className="w-3 rounded-t-full bg-gradient-to-t from-[#34c759] to-[#0071e3] dark:from-[#7CE4BA] dark:to-[#AFDDFF] shadow-xs"
                      style={{ height: `${Math.max(v, 8)}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { l: "Sessions", v: String(stats?.total_sessions ?? 0) },
                  { l: "Questions", v: String(totalQuestions) },
                  { l: "Top Subject", v: String(topSubject) },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-2 shadow-xs"
                  >
                    <div className="truncate text-xs sm:text-sm font-bold text-foreground">
                      {s.v}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="apple-glass-card p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-sm font-bold text-foreground font-graphik tracking-wide">
                RECENT SESSIONS
              </h3>
              {sessions.length > 0 && (
                <span className="apple-pill-badge py-0.5 px-2 text-[10px]">
                  {sessions.length} total
                </span>
              )}
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
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs sm:text-sm font-bold text-foreground">
                          {title}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {String(s.created_at ?? "").slice(0, 10)} ·{" "}
                          {String(s.duration_minutes ?? "—")} min
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {score !== null ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              score >= 80
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-[#7CE4BA] border border-emerald-500/30"
                                : "bg-primary/15 text-primary border border-primary/30"
                            }`}
                          >
                            {score}%
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {String(s.status ?? "Pending")}
                          </span>
                        )}
                        <Link
                          to="/ai-viva/session/$id"
                          params={{ id: String(s.id) }}
                          className="apple-glass-btn-secondary min-h-[36px] inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold no-underline"
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
        </div>
      </div>
    </AppShell>
  );
}
