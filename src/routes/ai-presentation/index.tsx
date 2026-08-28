import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MonitorSmartphone, Play, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreatePresentation, usePresentations, useProjects } from "@/lib/hooks";

import { LIVE_LANGUAGES } from "@/lib/languages";

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
  const [language, setLanguage] = useState<string>("English");
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
        language,
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
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-graphik">
                AI Presentation Mock
              </h1>
              <span className="apple-pill-badge py-0.5 px-2 text-[10px]">SLIDE DEFENSE</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Present to AI faculty, share your screen, and get instant real-time defense feedback.
            </p>
          </div>
        </div>

        {/* Top Section */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 shrink-0">
          <div className="lg:col-span-5 apple-glass-card p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <span className="apple-pill-badge text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                LIVE SCREEN REVIEW
              </span>
              <h2 className="mt-3 text-lg sm:text-xl font-bold tracking-tight text-foreground font-graphik">
                Defend like it's the real review
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Share your screen, present your slides in{" "}
                <strong className="text-primary">{language}</strong>, and AI faculty asks
                follow-ups, scores clarity, and flags missing topics.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                disabled={createSession.isPending}
                onClick={() => void begin()}
                className="apple-glass-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 px-5 py-2 text-xs sm:text-sm cursor-pointer uppercase tracking-wider"
              >
                <Play className="h-4 w-4 fill-current" />{" "}
                {createSession.isPending ? "Starting…" : "Start Session"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 apple-glass-card p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-graphik">
                SESSION SETUP
              </h3>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-2.5 shadow-xs">
                  <span className="block text-[10px] text-muted-foreground font-medium mb-1">
                    Project
                  </span>
                  <Select
                    value={projectId || "none"}
                    onValueChange={(v) => setProjectId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="w-full min-h-[36px] rounded-xl bg-card border border-border px-2 py-1 text-xs font-bold text-foreground focus:border-primary">
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {(projects ?? []).map((p) => (
                        <SelectItem key={String(p.id)} value={String(p.id)}>
                          {String(p.title)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-2.5 shadow-xs">
                  <span className="block text-[10px] text-muted-foreground font-medium mb-1">
                    Type
                  </span>
                  <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                    <SelectTrigger className="w-full min-h-[36px] rounded-xl bg-card border border-border px-2 py-1 text-xs font-bold text-foreground focus:border-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-2.5 shadow-xs">
                  <span className="block text-[10px] text-muted-foreground font-medium mb-1">
                    Duration
                  </span>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                    <SelectTrigger className="w-full min-h-[36px] rounded-xl bg-card border border-border px-2 py-1 text-xs font-bold text-foreground focus:border-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} mins
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-2.5 shadow-xs">
                  <span className="block text-[10px] text-muted-foreground font-medium mb-1">
                    Language
                  </span>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full min-h-[36px] rounded-xl bg-card border border-border px-2 py-1 text-xs font-bold text-foreground focus:border-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIVE_LANGUAGES.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2.5 rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-2.5 shadow-xs">
                <label className="block text-[10px] text-muted-foreground font-medium">
                  Topic / focus (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Distributed Consensus Engine Architecture or Sprint 4 Demo"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-1 w-full min-h-[36px] rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-xs"
                />
              </div>
            </div>
            {error && <p className="mt-1.5 text-xs text-rose-500 font-mono">{error}</p>}
            <button
              disabled={createSession.isPending}
              onClick={() => void begin()}
              className="mt-3 apple-glass-btn-primary min-h-[44px] w-full py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider cursor-pointer"
            >
              {createSession.isPending ? "Starting…" : "Begin Presentation"}
            </button>
          </div>
        </div>

        {/* Past Sessions */}
        <div className="apple-glass-card p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-sm font-bold text-foreground font-graphik tracking-wide">
                PAST SESSIONS
              </h3>
              {allSessions.length > 0 && (
                <span className="apple-pill-badge py-0.5 px-2 text-[10px]">
                  {allSessions.length} total
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
                      className="group block apple-glass-card apple-glass-card-hover p-3.5 no-underline"
                    >
                      <div className="flex items-center justify-between">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                          <MonitorSmartphone className="h-4 w-4" />
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                      </div>
                      <div className="mt-2.5 font-bold text-xs sm:text-sm text-foreground truncate font-graphik">
                        {String(s.session_type ?? "Presentation")}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {String(s.created_at ?? "").slice(0, 10)} ·{" "}
                        {String(s.duration_minutes ?? "—")} min
                      </div>
                      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-border">
                        {score !== null ? (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                              score >= 80
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-[#7CE4BA]"
                                : "bg-primary/15 text-primary"
                            }`}
                          >
                            {score}%
                          </span>
                        ) : (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                            {status}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-primary group-hover:underline">
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
