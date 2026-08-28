import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MonitorSmartphone, Play, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreatePresentation, usePresentations, useProjects } from "@/lib/hooks";

export const Route = createFileRoute("/ai-presentation/")({
  head: () => ({
    meta: [
      { title: "AI Presentation Mock — VivAI" },
      {
        name: "description",
        content: "Present to AI, share your screen, and get faculty-style real-time feedback.",
      },
    ],
  }),
  component: AIPresentation,
});

const SESSION_TYPES = ["Mid Review", "Final Demo", "Internal"] as const;
const DURATIONS = [5, 10, 15, 20] as const;
const PAGE_SIZE = 3;

function AIPresentation() {
  useRequireAuth();
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const sessionsQuery = usePresentations();
  const createSession = useCreatePresentation();
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<string>(SESSION_TYPES[0]);
  const [duration, setDuration] = useState<number>(10);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const allSessions = sessionsQuery.data ?? [];
  const totalPages = Math.max(1, Math.ceil(allSessions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleSessions = allSessions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const begin = async () => {
    setError("");
    try {
      const res = await createSession.mutateAsync({
        project_id: projectId || null,
        session_type: type,
        duration_minutes: duration,
        subject: topic.trim() || null,
      });
      navigate({ to: "/ai-presentation/session/$id", params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session");
    }
  };

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-graphik">
                AI Presentation Mock
              </h1>
              <span className="text-[10px] sm:text-xs text-[#8DA6CC] bg-[#8DA6CC]/15 px-2 py-0.5 rounded font-mono">
                [ SLIDE_DEFENSE ]
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Present to AI faculty, share your screen, and get instant real-time defense feedback.
            </p>
          </div>
        </div>

        {/* Top Section */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 shrink-0">
          <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-card/85 p-4 sm:p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex flex-col justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8DA6CC]/15 border border-[#8DA6CC]/30 px-2.5 py-1 text-[11px] font-mono font-bold text-[#8DA6CC]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8DA6CC] animate-pulse" />
                LIVE_SCREEN_REVIEW
              </span>
              <h2 className="mt-3 text-lg sm:text-xl font-bold tracking-tight text-white font-graphik">
                Defend like it's the real review
              </h2>
              <p className="mt-1 max-w-md text-xs sm:text-sm text-white/60 leading-relaxed">
                Share your screen, present your slides, and AI faculty asks follow-ups, scores clarity, and flags missing topics.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                disabled={createSession.isPending}
                onClick={() => void begin()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#AFDDFF] px-5 py-2.5 text-xs sm:text-sm font-bold text-black shadow-[0_0_14px_rgba(175,221,255,0.25)] hover:bg-[#c8e8ff] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
              >
                <Play className="h-4 w-4 fill-current" />{" "}
                {createSession.isPending ? "Starting…" : "Start Session"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-card/85 p-4 sm:p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 font-mono">
                [ SESSION_SETUP ]
              </h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="block text-[10px] text-white/50 font-medium">Project</span>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="mt-1 w-full min-h-[36px] rounded-lg bg-black/60 border border-white/10 px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-[#AFDDFF] truncate"
                  >
                    <option value="" className="bg-[#0A0E16] text-white">No project</option>
                    {(projects ?? []).map((p) => (
                      <option key={String(p.id)} value={String(p.id)} className="bg-[#0A0E16] text-white">
                        {String(p.title)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="block text-[10px] text-white/50 font-medium">Type</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="mt-1 w-full min-h-[36px] rounded-lg bg-black/60 border border-white/10 px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-[#AFDDFF]"
                  >
                    {SESSION_TYPES.map((t) => (
                      <option key={t} className="bg-[#0A0E16] text-white">{t}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                  <span className="block text-[10px] text-white/50 font-medium">Duration</span>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="mt-1 w-full min-h-[36px] rounded-lg bg-black/60 border border-white/10 px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-[#AFDDFF]"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d} className="bg-[#0A0E16] text-white">
                        {d} mins
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
                <label className="block text-[10px] text-white/50 font-medium">
                  Topic / focus (optional)
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. IoT smart irrigation — sensor architecture and cloud pipeline"
                  className="mt-1 w-full min-h-[36px] rounded-lg bg-black/60 border border-white/10 px-3 py-1 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#AFDDFF]"
                />
              </div>
            </div>
            {error && <p className="mt-1.5 text-xs text-rose-400 font-mono">{error}</p>}
            <button
              disabled={createSession.isPending}
              onClick={() => void begin()}
              className="mt-3 min-h-[44px] w-full rounded-xl bg-[#AFDDFF] py-2.5 text-xs sm:text-sm font-bold text-black shadow-[0_0_14px_rgba(175,221,255,0.25)] hover:bg-[#c8e8ff] active:scale-[0.98] transition-all cursor-pointer uppercase tracking-wider"
            >
              {createSession.isPending ? "Starting…" : "Begin Presentation"}
            </button>
          </div>
        </div>

        {/* Past Sessions */}
        <div className="rounded-2xl border border-white/10 bg-card/85 p-4 sm:p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold text-white font-graphik tracking-wide">
                [ PAST_SESSIONS ]
              </h3>
              {allSessions.length > 0 && (
                <span className="text-[11px] font-mono text-white/60 bg-white/10 px-2 py-0.5 rounded">
                  {allSessions.length} total
                </span>
              )}
            </div>
            {sessionsQuery.isLoading ? (
              <p className="mt-3 text-xs text-white/50">Loading sessions…</p>
            ) : sessionsQuery.error ? (
              <ErrorState
                message={
                  sessionsQuery.error instanceof Error
                    ? sessionsQuery.error.message
                    : "Could not load sessions"
                }
                onRetry={() => void sessionsQuery.refetch()}
              />
            ) : allSessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                description="Start your first AI presentation practice above."
              />
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {visibleSessions.map((s) => {
                  const score = s.overall_score == null ? null : Number(s.overall_score);
                  const status = String(s.status ?? "Pending");
                  const completed = status === "Completed";
                  return (
                    <Link
                      key={String(s.id)}
                      to="/ai-presentation/session/$id"
                      params={{ id: String(s.id) }}
                      className="group block rounded-xl border border-white/10 bg-white/5 p-3.5 transition-all hover:border-[#8DA6CC]/50 hover:bg-white/10 no-underline"
                    >
                      <div className="flex items-center justify-between">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#8DA6CC]/20 text-[#8DA6CC]">
                          <MonitorSmartphone className="h-4 w-4" />
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/40 group-hover:translate-x-1 group-hover:text-white transition-all" />
                      </div>
                      <div className="mt-2.5 font-bold text-xs sm:text-sm text-white truncate font-graphik">
                        {String(s.session_type ?? "Presentation")}
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/50">
                        {String(s.created_at ?? "").slice(0, 10)} · {String(s.duration_minutes ?? "—")} min
                      </div>
                      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-white/10">
                        {score !== null ? (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                              score >= 80 ? "bg-[#7CE4BA]/20 text-[#7CE4BA]" : "bg-[#8DA6CC]/20 text-[#8DA6CC]"
                            }`}
                          >
                            {score}%
                          </span>
                        ) : (
                          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10.5px] font-medium text-white/60">
                            {status}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-[#8DA6CC] group-hover:underline">
                          {completed ? "Review" : status === "In Progress" ? "Resume" : "Open"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          {allSessions.length > 0 && (
            <DataPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={allSessions.length}
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
