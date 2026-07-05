import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Sparkles,
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  X,
  Download,
} from "lucide-react";
import { useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { ProjectDetailSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useCreateTask,
  useProject,
  useUpdateTask,
  useDeleteTask,
  useUpdateTaskStatus,
  useUpdateProject,
  useDeleteProject,
  useUpdateProgress,
  type ApiRecord,
} from "@/lib/hooks";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Project — CollgePro Navigator" }] }),
  component: ProjectDetail,
});

const TABS = ["Overview", "Tasks", "Team", "Files", "Viva Prep", "Activity"] as const;
type Tab = (typeof TABS)[number];

function ProjectDetail() {
  useRequireAuth();
  const { id } = Route.useParams();
  const { data: project, isLoading, error, refetch } = useProject(id);
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState(false);

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
  const vivas = (project.viva_sessions as ApiRecord[] | undefined) ?? [];
  const doneTasks = tasks.filter((t) => t.status === "Done").length;
  const memberCount = teams.reduce(
    (sum, t) => sum + ((t.team_members as ApiRecord[] | undefined) ?? []).length,
    0,
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
              {String(project.subject ?? "General")}
              {project.semester ? ` · Semester ${String(project.semester)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        </div>
      </div>

      <Card className="!p-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                t === tab ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {tab === "Overview" && (
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
          <ProgressCard projectId={id} progress={progress} />
        </div>
      )}

      {tab === "Tasks" && <TasksBoard projectId={id} tasks={tasks} />}
      {tab === "Team" && <TeamTab teams={teams} />}
      {tab === "Files" && <FilesTab files={files} />}
      {tab === "Viva Prep" && <VivaTab vivas={vivas} projectId={id} />}
      {tab === "Activity" && <ActivityTab tasks={tasks} vivas={vivas} />}

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
    </AppShell>
  );
}

function ProgressCard({ projectId, progress }: { projectId: string; progress: number }) {
  const updateProgress = useUpdateProgress();
  const [value, setValue] = useState(progress);

  return (
    <Card className="lg:col-span-4 bg-primary text-primary-foreground">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium opacity-90">Project Progress</span>
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="mt-4 flex items-center justify-center">
        <svg viewBox="0 0 120 120" className="h-36 w-36">
          <circle cx="60" cy="60" r="50" fill="none" stroke="oklch(1 0 0 / 0.2)" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="white"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 50}`}
            strokeDashoffset={`${2 * Math.PI * 50 * (1 - value / 100)}`}
            transform="rotate(-90 60 60)"
          />
          <text x="60" y="66" textAnchor="middle" className="fill-current text-2xl font-bold">
            {value}%
          </text>
        </svg>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-4 w-full accent-white"
        aria-label="Set progress"
      />
      <button
        disabled={updateProgress.isPending || value === progress}
        onClick={() => updateProgress.mutate({ id: projectId, progress: value })}
        className="mt-3 block w-full rounded-xl bg-primary-foreground px-4 py-2.5 text-center text-sm font-semibold text-primary disabled:opacity-50"
      >
        {updateProgress.isPending ? "Saving…" : value === progress ? "Progress saved" : "Save progress"}
      </button>
      <Link
        to="/ai-viva/new"
        className="mt-2 block w-full rounded-xl border border-primary-foreground/40 px-4 py-2.5 text-center text-sm font-semibold"
      >
        Start AI Viva Practice
      </Link>
    </Card>
  );
}

const COLUMNS = [
  { title: "To Do", tone: "muted" as const },
  { title: "In Progress", tone: "primary" as const },
  { title: "Done", tone: "success" as const },
];
const NEXT_STATUS: Record<string, string> = { "To Do": "In Progress", "In Progress": "Done", Done: "To Do" };

function TasksBoard({ projectId, tasks }: { projectId: string; tasks: ApiRecord[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("med");
  const [dueDate, setDueDate] = useState("");
  const [editTask, setEditTask] = useState<ApiRecord | null>(null);
  const createTask = useCreateTask();
  const updateStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();

  const addTask = async () => {
    if (!title.trim()) return;
    await createTask.mutateAsync({
      projectId,
      title: title.trim(),
      priority,
      due_date: dueDate || undefined,
    });
    setTitle("");
    setDueDate("");
    setPriority("med");
    setShowAdd(false);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Tasks</h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Task
        </button>
      </div>
      {showAdd && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title…"
            className="min-w-[12rem] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            aria-label="Priority"
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            aria-label="Due date"
          />
          <button
            disabled={createTask.isPending || !title.trim()}
            onClick={() => void addTask()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createTask.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => String(t.status ?? "To Do") === col.title);
          return (
            <div key={col.title} className="rounded-xl bg-secondary p-3">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold">
                <Badge tone={col.tone}>{col.title}</Badge>
                <span className="text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => {
                  const p = String(t.priority ?? "med");
                  const taskId = String(t.id);
                  return (
                    <div key={taskId} className="rounded-lg bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{String(t.title)}</div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            aria-label="Edit task"
                            onClick={() => setEditTask(t)}
                            className="grid h-6 w-6 place-items-center rounded-md hover:bg-secondary"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            aria-label="Delete task"
                            onClick={() => deleteTask.mutate({ taskId, projectId })}
                            className="grid h-6 w-6 place-items-center rounded-md text-destructive hover:bg-secondary"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {Boolean(t.description) && (
                        <p className="mt-1 text-xs text-muted-foreground">{String(t.description)}</p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {t.due_date ? `Due ${String(t.due_date).slice(0, 10)}` : "No due date"}
                        </span>
                        <Badge tone={p === "high" ? "destructive" : p === "med" ? "warning" : "muted"}>{p}</Badge>
                      </div>
                      <button
                        onClick={() =>
                          updateStatus.mutate({ taskId, status: NEXT_STATUS[col.title], projectId })
                        }
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-secondary py-1.5 text-[11px] font-medium hover:bg-muted"
                      >
                        Move to {NEXT_STATUS[col.title]} <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No tasks</p>}
              </div>
            </div>
          );
        })}
      </div>
      {editTask && <EditTaskModal task={editTask} projectId={projectId} onClose={() => setEditTask(null)} />}
    </Card>
  );
}

function EditTaskModal({ task, projectId, onClose }: { task: ApiRecord; projectId: string; onClose: () => void }) {
  const updateTask = useUpdateTask();
  const [title, setTitle] = useState(String(task.title ?? ""));
  const [description, setDescription] = useState(String(task.description ?? ""));
  const [priority, setPriority] = useState(String(task.priority ?? "med"));
  const [dueDate, setDueDate] = useState(task.due_date ? String(task.due_date).slice(0, 10) : "");

  const save = async () => {
    await updateTask.mutateAsync({
      taskId: String(task.id),
      projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
    });
    onClose();
  };

  return (
    <ModalShell title="Edit task" onClose={onClose}>
      <label className="text-xs font-medium text-muted-foreground">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />
      <div className="mt-3 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>
      <button
        disabled={updateTask.isPending || !title.trim()}
        onClick={() => void save()}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {updateTask.isPending ? "Saving…" : "Save changes"}
      </button>
    </ModalShell>
  );
}

function EditProjectModal({ project, onClose }: { project: ApiRecord; onClose: () => void }) {
  const navigate = useNavigate();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const [title, setTitle] = useState(String(project.title ?? ""));
  const [subject, setSubject] = useState(String(project.subject ?? ""));
  const [description, setDescription] = useState(String(project.description ?? ""));
  const [status, setStatus] = useState(String(project.status ?? "In Progress"));
  const [deadline, setDeadline] = useState(project.deadline ? String(project.deadline).slice(0, 10) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    await updateProject.mutateAsync({
      id: String(project.id),
      title: title.trim(),
      subject: subject.trim() || undefined,
      description: description.trim() || undefined,
      status,
      deadline: deadline || undefined,
    });
    onClose();
  };

  const remove = async () => {
    await deleteProject.mutateAsync(String(project.id));
    navigate({ to: "/projects" });
  };

  return (
    <ModalShell title="Edit project" onClose={onClose}>
      <label className="text-xs font-medium text-muted-foreground">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />
      <div className="mt-3 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            <option>In Progress</option>
            <option>Completed</option>
            <option>On Hold</option>
          </select>
        </div>
      </div>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Deadline</label>
      <input
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />
      <button
        disabled={updateProject.isPending || !title.trim()}
        onClick={() => void save()}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {updateProject.isPending ? "Saving…" : "Save changes"}
      </button>
      <div className="mt-4 border-t border-border pt-4">
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">Delete this project and all its tasks? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl bg-secondary py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                disabled={deleteProject.isPending}
                onClick={() => void remove()}
                className="flex-1 rounded-xl bg-destructive py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {deleteProject.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 text-sm font-medium text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete project
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function TeamTab({ teams }: { teams: ApiRecord[] }) {
  if (teams.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          No team linked to this project yet.{" "}
          <Link to="/teams" className="font-medium text-primary">
            Create or join a team
          </Link>
          .
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {teams.map((team) => {
        const members = (team.team_members as ApiRecord[] | undefined) ?? [];
        return (
          <Card key={String(team.id)}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{String(team.name)}</h3>
              <Link to="/teams" className="text-xs font-medium text-primary">
                Manage
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {members.map((m) => {
                const profile = (m.profiles as ApiRecord | undefined) ?? {};
                return (
                  <div key={String(m.id)} className="flex items-center justify-between rounded-xl bg-secondary p-2.5">
                    <span className="text-sm font-medium">{String(profile.full_name ?? "Member")}</span>
                    <Badge tone={String(m.role) === "Lead" ? "primary" : "muted"}>{String(m.role ?? "Member")}</Badge>
                  </div>
                );
              })}
              {members.length === 0 && <p className="text-xs text-muted-foreground">No members yet</p>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function FilesTab({ files }: { files: ApiRecord[] }) {
  if (files.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          No files uploaded for this project.{" "}
          <Link to="/files" className="font-medium text-primary">
            Upload files
          </Link>
          .
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <h3 className="text-base font-semibold">Files</h3>
      <div className="mt-3 space-y-2">
        {files.map((f) => (
          <div key={String(f.id)} className="flex items-center justify-between rounded-xl bg-secondary p-3">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{String(f.name ?? f.filename ?? "File")}</div>
                <div className="text-[11px] text-muted-foreground">
                  {f.file_type ? String(f.file_type) : "Document"}
                  {f.created_at ? ` · ${String(f.created_at).slice(0, 10)}` : ""}
                </div>
              </div>
            </div>
            {Boolean(f.url) && (
              <a
                href={String(f.url)}
                target="_blank"
                rel="noreferrer"
                className="grid h-8 w-8 place-items-center rounded-lg bg-card"
                aria-label="Download file"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function VivaTab({ vivas, projectId }: { vivas: ApiRecord[]; projectId: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Viva Preparation</h3>
        <Link
          to="/ai-viva/new"
          search={{ projectId }}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" /> New session
        </Link>
      </div>
      <div className="mt-3 space-y-2">
        {vivas.map((v) => (
          <Link
            key={String(v.id)}
            to="/ai-viva/session/$id"
            params={{ id: String(v.id) }}
            className="flex items-center justify-between rounded-xl bg-secondary p-3 hover:bg-muted"
          >
            <div>
              <div className="text-sm font-medium">{String(v.session_type ?? "Viva session")}</div>
              <div className="text-[11px] text-muted-foreground">
                {v.created_at ? String(v.created_at).slice(0, 10) : ""} · {String(v.status ?? "—")}
              </div>
            </div>
            {v.score != null && <Badge tone="primary">{String(v.score)}%</Badge>}
          </Link>
        ))}
        {vivas.length === 0 && (
          <p className="text-sm text-muted-foreground">No viva sessions yet. Start one to practice for this project.</p>
        )}
      </div>
    </Card>
  );
}

function ActivityTab({ tasks, vivas }: { tasks: ApiRecord[]; vivas: ApiRecord[] }) {
  const events = [
    ...tasks.map((t) => ({
      ts: String(t.created_at ?? ""),
      label: `Task "${String(t.title)}" — ${String(t.status ?? "To Do")}`,
    })),
    ...vivas.map((v) => ({
      ts: String(v.created_at ?? ""),
      label: `Viva session ${String(v.status ?? "")}${v.score != null ? ` (${String(v.score)}%)` : ""}`,
    })),
  ]
    .filter((e) => e.ts)
    .sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <Card>
      <h3 className="text-base font-semibold">Recent activity</h3>
      <div className="mt-3 space-y-3">
        {events.map((e, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div>
              <p className="text-sm">{e.label}</p>
              <p className="text-[11px] text-muted-foreground">{e.ts.slice(0, 10)}</p>
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
      </div>
    </Card>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
