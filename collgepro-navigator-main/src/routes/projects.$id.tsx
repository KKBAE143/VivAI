import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Share2, MoreHorizontal, Sparkles, FileText, Users, CheckCircle2, Clock, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { ProjectDetailSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateTask, useProject, type ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Project — CollgePro Navigator" }] }),
  component: ProjectDetail,
});

const tabs = ["Overview", "Tasks", "Timeline", "Team", "Files", "Viva Prep", "Activity"];

function ProjectDetail() {
  useRequireAuth();
  const { id } = Route.useParams();
  const { data: project, isLoading, error, refetch } = useProject(id);

  if (isLoading) {
    return (
      <AppShell>
        <ProjectDetailSkeleton />
      </AppShell>
    );
  }
  if (error || !project) {
    return (
      <AppShell>
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load this project"}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );
  }

  const tasks = (project.tasks as ApiRecord[] | undefined) ?? [];
  const teams = (project.teams as ApiRecord[] | undefined) ?? [];
  const files = (project.files as ApiRecord[] | undefined) ?? [];
  const doneTasks = tasks.filter((t) => t.status === "Done").length;
  const memberCount = teams.reduce(
    (sum, t) => sum + (((t.team_members as ApiRecord[] | undefined) ?? []).length), 0,
  );
  const progress = Number(project.progress ?? 0);
  const status = String(project.status ?? "In Progress");
  const type = String(project.type ?? "PBL");
  const techStack = (project.tech_stack as string[] | null | undefined) ?? [];
  const about = String(project.description ?? project.problem_statement ?? "No description added yet.");
  const due = project.deadline ? String(project.deadline).slice(0, 10) : "—";

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link to="/projects" className="grid h-9 w-9 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={type === "Major" ? "primary" : "warning"}>{type}</Badge>
              <Badge tone={status === "Completed" ? "success" : "primary"}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> {status}
              </Badge>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{String(project.title)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {String(project.subject ?? "General")}{project.semester ? ` · Semester ${String(project.semester)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium">
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button aria-label="More" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Card className="!p-2">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((t, i) => (
            <button
              key={t}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                i === 0 ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <h3 className="text-base font-semibold">About this project</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{about}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {techStack.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {techStack.length === 0 && <span className="text-xs text-muted-foreground">No tech stack listed</span>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "Tasks", v: `${doneTasks} / ${tasks.length}`, i: CheckCircle2 },
              { l: "Files", v: String(files.length), i: FileText },
              { l: "Team", v: `${memberCount} members`, i: Users },
              { l: "Due", v: due, i: Clock },
            ].map((s) => {
              const I = s.i;
              return (
                <div key={s.l} className="rounded-xl bg-secondary p-3">
                  <I className="h-4 w-4 text-muted-foreground" />
                  <div className="mt-2 text-lg font-bold">{s.v}</div>
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="lg:col-span-4 bg-primary text-primary-foreground">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-90">Project Progress</span>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="mt-4 flex items-center justify-center">
            <svg viewBox="0 0 120 120" className="h-36 w-36">
              <circle cx="60" cy="60" r="50" fill="none" stroke="oklch(1 0 0 / 0.2)" strokeWidth="12" />
              <circle
                cx="60" cy="60" r="50" fill="none" stroke="white" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 50}`}
                strokeDashoffset={`${2 * Math.PI * 50 * (1 - progress / 100)}`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="66" textAnchor="middle" className="fill-current text-2xl font-bold">{progress}%</text>
            </svg>
          </div>
          <Link to="/ai-viva/new" className="mt-4 block w-full rounded-xl bg-primary-foreground px-4 py-2.5 text-center text-sm font-semibold text-primary">
            Start AI Viva Practice
          </Link>
        </Card>
      </div>

      <TasksBoard projectId={id} tasks={tasks} />
    </AppShell>
  );
}

function TasksBoard({ projectId, tasks }: { projectId: string; tasks: ApiRecord[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const createTask = useCreateTask();

  const addTask = async () => {
    if (!title.trim()) return;
    await createTask.mutateAsync({ projectId, title: title.trim() });
    setTitle("");
    setShowAdd(false);
  };

  const columns = [
    { title: "To Do", tone: "muted" as const },
    { title: "In Progress", tone: "primary" as const },
    { title: "Done", tone: "success" as const },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Tasks</h3>
        <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium">
          <Plus className="h-3.5 w-3.5" /> Add Task
        </button>
      </div>
      {showAdd && (
        <div className="mt-3 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title…"
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button
            disabled={createTask.isPending || !title.trim()}
            onClick={() => void addTask()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {createTask.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {columns.map((col) => {
          const items = tasks.filter((t) => String(t.status ?? "To Do") === col.title);
          return (
            <div key={col.title} className="rounded-xl bg-secondary p-3">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold">
                <Badge tone={col.tone}>{col.title}</Badge>
                <span className="text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => {
                  const priority = String(t.priority ?? "med");
                  return (
                    <div key={String(t.id)} className="rounded-lg bg-card p-3">
                      <div className="text-sm font-medium">{String(t.title)}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {t.due_date ? `Due ${String(t.due_date).slice(0, 10)}` : "No due date"}
                        </span>
                        <Badge tone={priority === "high" ? "destructive" : priority === "med" ? "warning" : "muted"}>{priority}</Badge>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No tasks</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}