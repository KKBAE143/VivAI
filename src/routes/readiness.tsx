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
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-graphik">
                Defense Readiness
              </h1>
              <span className="apple-pill-badge py-0.5 px-2 text-[10px]">
                DRS COCKPIT
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              A weighted evaluation of your oral defense preparation, code comprehension, and next drills.
            </p>
          </div>
        </div>

        {q.error ? (
          <ErrorState message="Could not compute your readiness" onRetry={() => void q.refetch()} />
        ) : (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Top Score Card */}
            <div className="apple-glass-card p-4 sm:p-5">
              <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-6">
                <div className="flex flex-col xs:flex-row items-center gap-4 text-center xs:text-left">
                  <ReadinessGauge score={data?.score ?? 0} size={96} strokeWidth={9} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 font-graphik">
                      OVERALL READINESS
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-white font-graphik mt-0.5">
                      {data?.label ?? "Getting started"}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">
                      {data?.viva_sessions ?? 0} vivas · {data?.presentation_sessions ?? 0} presentations
                    </p>
                    {data?.model && (
                      <div className="mt-2 flex flex-wrap items-center justify-center xs:justify-start gap-2">
                        <span className="apple-pill-badge text-[10px]">
                          {data.model === "v2" ? "DRS v2" : "Classic v1"}
                        </span>
                        <Link
                          to="/profile"
                          className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-medium text-white/60 hover:text-[#AFDDFF] no-underline"
                        >
                          <Settings className="h-3.5 w-3.5" /> Change model
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {(data?.components ?? []).map((c) => (
                    <div
                      key={c.key}
                      className="rounded-2xl border border-white/12 bg-white/5 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
                    >
                      <div className="flex items-center justify-between text-xs text-white font-semibold">
                        <span>{c.label}</span>
                        <span className="text-[#AFDDFF] font-bold">{Math.round(c.score)}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#7CE4BA] to-[#AFDDFF] shadow-[0_0_8px_rgba(175,221,255,0.4)]"
                          style={{ width: `${Math.min(100, c.score)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-white/40 font-mono">
                        Weight: {Math.round(c.weight * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom 2 Cards Grid */}
            <div className="grid gap-3 lg:grid-cols-2 flex-1 min-h-0">
              <div className="apple-glass-card p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 font-graphik">
                    RECOMMENDED ACTIONS
                  </h3>
                  <div className="mt-3 space-y-2.5">
                    {(data?.actions ?? []).length === 0 && (
                      <p className="text-xs text-white/50">
                        You&apos;re in great shape. Keep practicing to stay sharp.
                      </p>
                    )}
                    {(data?.actions ?? []).slice(0, 3).map((a, i) => (
                      <Link
                        key={i}
                        to={a.to}
                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/12 bg-white/5 p-3 min-h-[48px] transition-all hover:bg-white/10 hover:border-[#AFDDFF]/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] no-underline"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] text-black">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-bold text-white truncate">{a.text}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#AFDDFF]">
                          {a.cta} <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              <div className="apple-glass-card p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 font-graphik">
                    WEAK TOPICS
                  </h3>
                  <div className="mt-3 space-y-2">
                    {(data?.weak_topics ?? []).length === 0 ? (
                      <p className="text-xs text-white/50">
                        No weak topics detected yet — complete a few vivas to surface them.
                      </p>
                    ) : (
                      (data?.weak_topics ?? []).slice(0, 3).map((t, i) => {
                        const scoreVal = (t as { accuracy?: number; avg_score?: number }).accuracy ?? (t as { accuracy?: number; avg_score?: number }).avg_score ?? 60;
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-2xl border border-white/12 bg-white/5 p-3 text-xs shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                              <span className="font-bold text-white truncate">{t.topic}</span>
                            </div>
                            <span className="rounded-full bg-amber-400/15 border border-amber-400/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
                              {scoreVal}% acc
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <Link
                  to="/ai-viva/new"
                  className="mt-4 min-h-[44px] apple-glass-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold no-underline uppercase tracking-wider"
                >
                  <span>Practice Weak Topics</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
