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
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Defense Readiness
            </h1>
            <p className="text-xs text-muted-foreground">
              A weighted view of how prepared you are to defend your project, and exactly what to do
              next.
            </p>
          </div>
        </div>

        {q.error ? (
          <ErrorState message="Could not compute your readiness" onRetry={() => void q.refetch()} />
        ) : (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Top Score Card */}
            <Card className="p-3.5 sm:p-4">
              <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <ReadinessGauge score={data?.score ?? 0} size={90} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Overall Score
                    </p>
                    <p className="text-base sm:text-lg font-bold text-foreground">
                      {data?.label ?? "Getting started"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {data?.viva_sessions ?? 0} vivas · {data?.presentation_sessions ?? 0}{" "}
                      presentations
                    </p>
                    {data?.model && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge tone="primary">
                          {data.model === "v2" ? "DRS v2" : "Classic v1"}
                        </Badge>
                        <Link
                          to="/profile"
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                        >
                          <Settings className="h-3 w-3" /> Change model
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(data?.components ?? []).map((c) => (
                    <div
                      key={c.key}
                      className="rounded-lg border border-border p-2 bg-secondary/20"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{c.label}</span>
                        <span className="font-bold">{Math.round(c.score)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, c.score)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Weight {Math.round(c.weight * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Bottom 2 Cards Grid */}
            <div className="grid gap-3 lg:grid-cols-2 flex-1 min-h-0">
              <Card className="p-3.5 sm:p-4 flex flex-col justify-between overflow-y-auto">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold">Do this next</h3>
                  <div className="mt-2.5 space-y-2">
                    {(data?.actions ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        You&apos;re in great shape. Keep practicing to stay sharp.
                      </p>
                    )}
                    {(data?.actions ?? []).slice(0, 3).map((a, i) => (
                      <Link
                        key={i}
                        to={a.to}
                        className="flex items-center justify-between gap-2.5 rounded-lg border border-border p-2.5 transition-colors hover:border-primary bg-card/60"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-xs font-medium truncate">{a.text}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary">
                          {a.cta} <ArrowRight className="h-3 w-3" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-3.5 sm:p-4 flex flex-col justify-between overflow-y-auto">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold">Weak topics to review</h3>
                  <div className="mt-2.5 space-y-1.5">
                    {(data?.weak_topics ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No weak topics detected yet — complete a few vivas to surface them.
                      </p>
                    ) : (
                      (data?.weak_topics ?? []).slice(0, 3).map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg border border-border p-2.5 text-xs bg-card/60"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                            <span className="font-medium truncate">{t.topic}</span>
                          </div>
                          <Badge tone="warning">{t.accuracy}% acc</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <Link
                  to="/ai-viva/new"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  Practice weak topics in a mock viva <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
