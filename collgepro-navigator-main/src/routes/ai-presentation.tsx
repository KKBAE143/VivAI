import { createFileRoute } from "@tanstack/react-router";
import { MonitorSmartphone, Play, Upload } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreatePresentation, usePresentations, useProjects } from "@/lib/hooks";

export const Route = createFileRoute("/ai-presentation")({
  head: () => ({
    meta: [
      { title: "AI Presentation Mock — CollgePro Navigator" },
      { name: "description", content: "Present to AI, share your screen, and get faculty-style real-time feedback." },
    ],
  }),
  component: AIPresentation,
});

const SESSION_TYPES = ["Mid Review", "Final Demo", "Internal"] as const;
const DURATIONS = [5, 10, 15, 20] as const;

function AIPresentation() {
  useRequireAuth();
  const { data: projects } = useProjects();
  const sessionsQuery = usePresentations();
  const createSession = useCreatePresentation();
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<string>(SESSION_TYPES[0]);
  const [duration, setDuration] = useState<number>(10);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const begin = async () => {
    setError("");
    try {
      const res = await createSession.mutateAsync({
        project_id: projectId || null,
        session_type: type,
        duration_minutes: duration,
      });
      setCreatedId(String(res.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session");
    }
  };

  return (
    <AppShell>
      <PageHeader title="AI Presentation Mock" subtitle="Present to AI faculty, share your screen, get instant feedback." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7 bg-primary text-primary-foreground">
          <Badge tone="muted"><span className="text-primary">Live Screen Review</span></Badge>
          <h2 className="mt-5 text-2xl font-bold tracking-tight">Defend like it's the real review</h2>
          <p className="mt-2 max-w-md text-sm text-primary-foreground/85">
            Share your screen, present your slides, and AI faculty asks follow-ups, scores clarity, and flags missing topics.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              disabled={createSession.isPending}
              onClick={() => void begin()}
              className="flex items-center gap-2 rounded-xl bg-primary-foreground px-5 py-3 text-sm font-semibold text-primary"
            >
              <Play className="h-4 w-4" /> {createSession.isPending ? "Starting…" : "Start Session"}
            </button>
            <button className="flex items-center gap-2 rounded-xl bg-primary-foreground/15 px-5 py-3 text-sm font-medium">
              <Upload className="h-4 w-4" /> Upload PPT
            </button>
          </div>
          {createdId && (
            <p className="mt-4 rounded-xl bg-primary-foreground/15 p-3 text-sm">
              Session created — upload slide images one by one during your run-through, then end the session for your report.
            </p>
          )}
        </Card>
        <Card className="lg:col-span-5">
          <h3 className="text-base font-semibold">Setup</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3">
              <span className="text-xs text-muted-foreground">Project</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="max-w-[180px] rounded-lg bg-card px-2 py-1 text-sm font-semibold focus:outline-none"
              >
                <option value="">No project</option>
                {(projects ?? []).map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>{String(p.title)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3">
              <span className="text-xs text-muted-foreground">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-lg bg-card px-2 py-1 text-sm font-semibold focus:outline-none"
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3">
              <span className="text-xs text-muted-foreground">Duration</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-lg bg-card px-2 py-1 text-sm font-semibold focus:outline-none"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
              <span className="text-xs text-muted-foreground">Recording</span>
              <span className="text-sm font-semibold">Enabled</span>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <button
            disabled={createSession.isPending}
            onClick={() => void begin()}
            className="mt-6 w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background"
          >
            {createSession.isPending ? "Starting…" : "Begin Presentation"}
          </button>
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-semibold">Past Sessions</h3>
        {sessionsQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading sessions…</p>
        ) : sessionsQuery.error ? (
          <ErrorState
            message={sessionsQuery.error instanceof Error ? sessionsQuery.error.message : "Could not load sessions"}
            onRetry={() => void sessionsQuery.refetch()}
          />
        ) : (sessionsQuery.data ?? []).length === 0 ? (
          <EmptyState title="No sessions yet" description="Start your first AI presentation practice above." />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(sessionsQuery.data ?? []).map((s) => {
              const score = s.overall_score == null ? null : Number(s.overall_score);
              return (
                <div key={String(s.id)} className="rounded-xl border border-border p-4">
                  <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />
                  <div className="mt-3 font-semibold">{String(s.session_type ?? "Presentation")}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{String(s.created_at ?? "").slice(0, 10)}</div>
                  <div className="mt-3 flex items-center justify-between">
                    {score !== null ? (
                      <Badge tone={score >= 80 ? "success" : "warning"}>{score}%</Badge>
                    ) : (
                      <Badge tone="muted">{String(s.status ?? "Pending")}</Badge>
                    )}
                    <span className="text-xs font-medium text-muted-foreground">{String(s.duration_minutes ?? "—")} min</span>
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