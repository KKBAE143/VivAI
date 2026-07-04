import { createFileRoute } from "@tanstack/react-router";
import { Search, Filter, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateTask, useProjects, useTasks, useUpdateTaskStatus } from "@/lib/hooks";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress & Tasks — CollgePro Navigator" },
      { name: "description", content: "All your tasks across projects in one focused view." },
    ],
  }),
  component: Progress,
});

const STATUS_FILTERS = ["All", "To Do", "In Progress", "Done"] as const;

function Progress() {
  useRequireAuth();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];
  const [selectedProject, setSelectedProject] = useState("");
  const projectId = selectedProject || String(projects[0]?.id ?? "");
  const { data: tasks, isLoading, error, refetch } = useTasks(projectId || undefined);
  const updateStatus = useUpdateTaskStatus();
  const createTask = useCreateTask();

  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const allTasks = tasks ?? [];
  const done = allTasks.filter((t) => t.status === "Done").length;
  const pending = allTasks.length - done;
  const overdue = allTasks.filter(
    (t) => t.status !== "Done" && t.due_date && new Date(String(t.due_date)).getTime() < Date.now(),
  ).length;
  const completion = allTasks.length ? Math.round((done / allTasks.length) * 100) : 0;

  let visible = allTasks;
  if (filter !== "All") visible = visible.filter((t) => String(t.status ?? "To Do") === filter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter((t) => String(t.title ?? "").toLowerCase().includes(q));
  }

  const projectTitle = String(projects.find((p) => String(p.id) === projectId)?.title ?? "—");

  const addTask = async () => {
    if (!newTitle.trim() || !projectId) return;
    await createTask.mutateAsync({ projectId, title: newTitle.trim() });
    setNewTitle("");
    setShowAdd(false);
  };

  return (
    <AppShell>
      <PageHeader
        title="Progress & Tasks"
        subtitle="A unified view of everything on your plate."
        action={
          <button
            onClick={() => setShowAdd((v) => !v)}
            disabled={!projectId}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { l: "Completed", v: String(done), t: "tasks done", tone: "success" },
          { l: "Pending", v: String(pending), t: pending ? "in flight" : "all clear", tone: "warning" },
          { l: "Overdue", v: String(overdue), t: overdue ? "action needed" : "none overdue", tone: "destructive" },
          { l: "Completion", v: `${completion}%`, t: projectTitle, tone: "primary" },
        ].map((s) => (
          <Card key={s.l}>
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="mt-2 text-3xl font-bold tracking-tight">{s.v}</div>
            <Badge tone={s.tone as "success" | "warning" | "destructive" | "primary"}>{s.t}</Badge>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={projectId}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium focus:outline-none"
            >
              {projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{String(p.title)}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
              {STATUS_FILTERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${filter === t ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search tasks"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-32 bg-transparent focus:outline-none"
              />
            </div>
            <button className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
              <Filter className="h-3.5 w-3.5" /> Filter
            </button>
          </div>
        </div>
        {showAdd && (
          <div className="mt-4 flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title…"
              className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <button
              disabled={createTask.isPending || !newTitle.trim()}
              onClick={() => void addTask()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {createTask.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        )}
        {projectsQuery.isLoading || isLoading ? (
          <div className="mt-5">
            <TableSkeleton rows={6} />
          </div>
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Could not load tasks"}
            onRetry={() => void refetch()}
          />
        ) : !projectId ? (
          <EmptyState title="No projects yet" description="Create a project first, then track its tasks here." />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No tasks found"
            description={filter !== "All" || search ? "Try a different filter or search term." : "Add your first task to get moving."}
          />
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">ID</th>
                  <th className="py-2 pr-3 font-medium">Task</th>
                  <th className="py-2 pr-3 font-medium">Project</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Priority</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const status = String(t.status ?? "To Do");
                  const priority = String(t.priority ?? "med");
                  const taskId = String(t.id);
                  return (
                    <tr key={taskId} className="border-b border-border last:border-0 hover:bg-secondary/40">
                      <td className="py-3.5 pr-3 text-xs font-medium text-muted-foreground">T-{taskId.slice(0, 4)}</td>
                      <td className="py-3.5 pr-3">
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={status === "Done"}
                            disabled={updateStatus.isPending}
                            onChange={(e) =>
                              updateStatus.mutate({ taskId, status: e.target.checked ? "Done" : "To Do" })
                            }
                            className="h-4 w-4 rounded border-border"
                          />
                          <span className={status === "Done" ? "text-muted-foreground line-through" : "font-medium"}>
                            {String(t.title)}
                          </span>
                        </label>
                      </td>
                      <td className="py-3.5 pr-3 text-muted-foreground">{projectTitle}</td>
                      <td className="py-3.5 pr-3">
                        <Badge tone={status === "Done" ? "success" : status === "In Progress" ? "primary" : "muted"}>{status}</Badge>
                      </td>
                      <td className="py-3.5 pr-3">
                        <Badge tone={priority === "high" ? "destructive" : priority === "med" ? "warning" : "muted"}>{priority}</Badge>
                      </td>
                      <td className="py-3.5 pr-3 text-xs text-muted-foreground">
                        {t.due_date ? String(t.due_date).slice(0, 10) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}