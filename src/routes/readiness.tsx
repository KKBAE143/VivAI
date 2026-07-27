import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, AlertTriangle, Sparkles, TrendingUp, Settings } from "lucide-react";

import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { ReadinessGauge } from "@/components/readiness-gauge";
import { useRequireAuth } from "@/lib/auth-context";
import { useReadiness, useBenchmarks } from "@/lib/hooks-features";

export const Route = createFileRoute("/readiness")({
  head: () => ({ meta: [{ title: "Defense Readiness — VivAI" }] }),
  component: ReadinessPage,
});

function ReadinessPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const q = useReadiness();
  const benchmarks = useBenchmarks();

  if (!authLoading && !ready) return null;

  const data = q.data;
  const bm = benchmarks.data;

  return (
    <AppShell>
      <PageHeader
        title="Defense Readiness"
        subtitle="A weighted view of how prepared you are to defend your project, and exactly what to do next."
      />

      {q.error ? (
        <ErrorState message="Could not compute your readiness" onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card className="!p-0">
            <div className="grid gap-6 p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8">
              <div className="flex items-center gap-5">
                <ReadinessGauge score={data?.score ?? 0} size={132} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Overall
                  </p>
                  <p className="mt-1 text-xl font-bold text-balance">
                    {data?.label ?? "Getting started"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data?.viva_sessions ?? 0} vivas · {data?.presentation_sessions ?? 0}{" "}
                    presentations
                  </p>
                  {data?.model && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge tone="primary">{data.model === "v2" ? "DRS v2" : "Classic v1"}</Badge>
                      <Link
                        to="/profile"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                      >
                        <Settings className="h-3 w-3" /> Change model
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(data?.components ?? []).map((c) => (
                  <div key={c.key} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.label}</span>
                      <span className="font-bold">{Math.round(c.score)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, c.score)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Weight {Math.round(c.weight * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Peer Benchmarks */}
          {bm?.available && (
            <Card>
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-semibold">Peer Benchmarks</h3>
                  <p className="text-xs text-muted-foreground">
                    How you compare to students at your college
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{bm.percentile ?? 0}%</p>
                  <p className="text-xs text-muted-foreground">Percentile</p>
                  <p className="mt-1 text-xs font-medium">{bm.peer_label ?? ""}</p>
                </div>
                <div className="rounded-xl border border-border p-4 text-center">
                  <p className="text-2xl font-bold">{bm.user_avg ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Your Avg Score</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {bm.user_sessions ?? 0} sessions
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4 text-center">
                  <p className="text-2xl font-bold">{bm.college?.avg ?? 0}</p>
                  <p className="text-xs text-muted-foreground">College Avg</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {bm.college?.students ?? 0} students
                  </p>
                </div>
              </div>
              {bm.peer_description && (
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  You are in the{" "}
                  <span className="font-semibold text-primary">{bm.peer_description}</span>
                </p>
              )}
              {(bm.branch || bm.year) && (
                <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
                  {bm.branch && (
                    <span>
                      Branch avg: {bm.branch.avg} ({bm.branch.count} sessions)
                    </span>
                  )}
                  {bm.year && (
                    <span>
                      Year avg: {bm.year.avg} ({bm.year.count} sessions)
                    </span>
                  )}
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold">Do this next</h3>
              <div className="mt-4 space-y-3">
                {(data?.actions ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    You&apos;re in great shape. Keep practicing to stay sharp.
                  </p>
                )}
                {(data?.actions ?? []).map((a, i) => (
                  <Link
                    key={i}
                    to={a.to}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-accent-foreground">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">{a.text}</span>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                      {a.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold">Weak topics to review</h3>
              <div className="mt-4 space-y-2">
                {(data?.weak_topics ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No weak topics detected yet — complete a few vivas to surface them.
                  </p>
                ) : (
                  (data?.weak_topics ?? []).map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <AlertTriangle className="h-4 w-4 text-warning" /> {t.topic}
                      </span>
                      <Badge tone={t.avg_score < 50 ? "destructive" : "warning"}>
                        {Math.round(t.avg_score)}%
                      </Badge>
                    </div>
                  ))
                )}
              </div>
              <Link
                to="/ai-viva/new"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary"
              >
                Practice weak topics in a mock viva <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
