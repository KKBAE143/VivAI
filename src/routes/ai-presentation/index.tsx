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
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              AI Presentation Mock
            </h1>
            <p className="text-xs text-muted-foreground">
              Present to AI faculty, share your screen, and get instant real-time feedback.
            </p>
          </div>
        </div>

        {/* Top Section */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Card className="lg:col-span-6 bg-primary text-primary-foreground p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <Badge tone="muted">
                <span className="text-primary text-[11px] font-semibold">Live Screen Review</span>
              </Badge>
              <h2 className="mt-3 text-xl sm:text-2xl font-bold tracking-tight">
                Defend like it's the real review
              </h2>
              <p className="mt-1 max-w-md text-xs sm:text-sm text-primary-foreground/90 leading-relaxed">
                Share your screen, present your slides, and AI faculty asks follow-ups, scores
                clarity, and flags missing topics.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={createSession.isPending}
                onClick={() => void begin()}
                className="flex items-center gap-1.5 rounded-xl bg-primary-foreground px-4 py-2 text-xs sm:text-sm font-semibold text-primary shadow-sm hover:opacity-95"
              >
                <Play className="h-3.5 w-3.5" />{" "}
                {createSession.isPending ? "Starting…" : "Start Session"}
              </button>
            </div>
          </Card>

          <Card className="lg:col-span-6 p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Session Setup
              </h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg bg-secondary p-2">
                  <span className="block text-[10px] text-muted-foreground">Project</span>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="mt-0.5 w-full rounded bg-card px-1.5 py-1 text-xs font-semibold focus:outline-none truncate"
                  >
                    <option value="">No project</option>
                    {(projects ?? []).map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.title)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-lg bg-secondary p-2">
                  <span className="block text-[10px] text-muted-foreground">Type</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="mt-0.5 w-full rounded bg-card px-1.5 py-1 text-xs font-semibold focus:outline-none"
                  >
                    {SESSION_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-lg bg-secondary p-2">
                  <span className="block text-[10px] text-muted-foreground">Duration</span>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="mt-0.5 w-full rounded bg-card px-1.5 py-1 text-xs font-semibold focus:outline-none"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} mins
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2 rounded-lg bg-secondary p-2">
                <label className="block text-[10px] text-muted-foreground">
                  Topic / focus (optional)
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. IoT smart irrigation — sensor architecture and cloud pipeline"
                  className="mt-1 w-full rounded bg-card px-2.5 py-1 text-xs focus:outline-none"
                />
              </div>
            </div>
            {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            <button
              disabled={createSession.isPending}
              onClick={() => void begin()}
              className="mt-3 w-full rounded-xl bg-foreground py-2 text-xs sm:text-sm font-semibold text-background hover:opacity-90"
            >
              {createSession.isPending ? "Starting…" : "Begin Presentation"}
            </button>
          </Card>
        </div>

        {/* Past Sessions */}
        <Card className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Past Sessions</h3>
              {allSessions.length > 0 && <Badge tone="muted">{allSessions.length} total</Badge>}
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
            ) : allSessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                description="Start your first AI presentation practice above."
              />
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {visibleSessions.map((s) => {
                  const score = s.overall_score == null ? null : Number(s.overall_score);
                  const status = String(s.status ?? "Pending");
                  const completed = status === "Completed";
                  return (
                    <Link
                      key={String(s.id)}
                      to="/ai-presentation/session/$id"
                      params={{ id: String(s.id) }}
                      className="group block rounded-xl border border-border p-3 transition-colors hover:border-primary bg-card/60"
                    >
                      <div className="flex items-center justify-between">
                        <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="mt-2 font-semibold text-xs sm:text-sm truncate">
                        {String(s.session_type ?? "Presentation")}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {String(s.created_at ?? "").slice(0, 10)}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        {score !== null ? (
                          <Badge tone={score >= 80 ? "success" : "warning"}>{score}%</Badge>
                        ) : (
                          <Badge tone="muted">{status}</Badge>
                        )}
                        <span className="text-[11px] font-medium text-primary">
                          {completed ? "Review" : status === "In Progress" ? "Resume" : "Open"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {String(s.duration_minutes ?? "—")} min
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
        </Card>
      </div>
    </AppShell>
  );
}
