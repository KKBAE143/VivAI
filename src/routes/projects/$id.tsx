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
  Download,
} from "lucide-react";
import { useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { ProjectDetailSkeleton } from "@/components/loading-skeleton";
import { ModalShell } from "@/components/modal-shell";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useCreateTask,
  useProject,
  useUpdateTask,
  useDeleteTask,
  useUpdateProject,
  useDeleteProject,
  useUpdateProgress,
  type ApiRecord,
} from "@/lib/hooks";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { ProjectTeamTab } from "@/components/projects/team-tab";
import { taskDerivedProgress } from "@/lib/utils";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Project — VivAI" }] }),
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
  const about = String(
    project.description ?? project.problem_statement ?? "No description added yet.",
  );
  const due = project.deadline ? String(project.deadline).slice(0, 10) : "—";

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            to="/projects"
            className="grid h-9 w-9 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]"
          >
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

      <Card className="!p-1.5 sm:!p-2">
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5 sm:pb-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                t === tab
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-secondary"
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
              {techStack.length === 0 && (
                <span className="text-xs text-muted-foreground">No tech stack listed</span>
              )}
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
          <ProgressCard projectId={id} progress={progress} tasks={tasks} />
        </div>
      )}

      {tab === "Tasks" && (
        <TasksBoard
          projectId={id}
          tasks={tasks}
          teamMembers={(teams[0]?.team_members as ApiRecord[] | undefined) ?? []}
        />
      )}
      {tab === "Team" && <ProjectTeamTab projectId={id} teams={teams} />}
      {tab === "Files" && <FilesTab files={files} />}
      {tab === "Viva Prep" && <VivaTab vivas={vivas} projectId={id} />}
      {tab === "Activity" && <ActivityTab tasks={tasks} vivas={vivas} />}

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
    </AppShell>
  );
}

function ProgressCard({
  projectId,
  progress,
  tasks,
}: {
  projectId: string;
  progress: number;
  tasks: ApiRecord[];
}) {
  const updateProgress = useUpdateProgress();
  const [value, setValue] = useState(progress);
  const suggested = taskDerivedProgress(tasks);

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
      {suggested != null && suggested !== value && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs opacity-90">
          <span>Suggested from tasks: {suggested}%</span>
          <button
            type="button"
            onClick={() => setValue(suggested)}
            className="rounded-full border border-primary-foreground/40 px-2.5 py-1 font-semibold"
          >
            Apply
          </button>
        </div>
      )}
      <button
        disabled={updateProgress.isPending || value === progress}
        onClick={() => updateProgress.mutate({ id: projectId, progress: value })}
        className="mt-3 block w-full rounded-xl bg-primary-foreground px-4 py-2.5 text-center text-sm font-semibold text-primary disabled:opacity-50"
      >
        {updateProgress.isPending
          ? "Saving…"
          : value === progress
            ? "Progress saved"
            : "Save progress"}
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

function TasksBoard({
  projectId,
  tasks,
  teamMembers,
}: {
  projectId: string;
  tasks: ApiRecord[];
  teamMembers: ApiRecord[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("med");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [editTask, setEditTask] = useState<ApiRecord | null>(null);
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();

  const addTask = async () => {
    if (!title.trim()) return;
    await createTask.mutateAsync({
      projectId,
      title: title.trim(),
      priority,
      due_date: dueDate || undefined,
      assignee_id: assigneeId || undefined,
    });
    setTitle("");
    setDueDate("");
    setPriority("med");
    setAssigneeId("");
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
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            aria-label="Assignee"
          >
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={String(m.profile_id)} value={String(m.profile_id)}>
                {String((m.profiles as ApiRecord | undefined)?.full_name ?? "Member")}
              </option>
            ))}
          </select>
          <button
            disabled={createTask.isPending || !title.trim()}
            onClick={() => void addTask()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createTask.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      <KanbanBoard
        projectId={projectId}
        tasks={tasks}
        teamMembers={teamMembers}
        onEdit={setEditTask}
        onDelete={(task) => deleteTask.mutate({ taskId: String(task.id), projectId })}
      />
      {editTask && (
        <EditTaskModal
          task={editTask}
          projectId={projectId}
          teamMembers={teamMembers}
          onClose={() => setEditTask(null)}
        />
      )}
    </Card>
  );
}

function EditTaskModal({
  task,
  projectId,
  teamMembers,
  onClose,
}: {
  task: ApiRecord;
  projectId: string;
  teamMembers: ApiRecord[];
  onClose: () => void;
}) {
  const updateTask = useUpdateTask();
  const [title, setTitle] = useState(String(task.title ?? ""));
  const [description, setDescription] = useState(String(task.description ?? ""));
  const [priority, setPriority] = useState(String(task.priority ?? "med"));
  const [dueDate, setDueDate] = useState(task.due_date ? String(task.due_date).slice(0, 10) : "");
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ? String(task.assignee_id) : "");

  const save = async () => {
    await updateTask.mutateAsync({
      taskId: String(task.id),
      projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
      // Sent every save (not omitted), so explicitly clearing the assignee
      // ("Unassigned") is honored — see backend's exclude_unset handling.
      assignee_id: assigneeId || null,
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
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Assignee</label>
      <select
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="">Unassigned</option>
        {teamMembers.map((m) => (
          <option key={String(m.profile_id)} value={String(m.profile_id)}>
            {String((m.profiles as ApiRecord | undefined)?.full_name ?? "Member")}
          </option>
        ))}
      </select>
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
  const [deadline, setDeadline] = useState(
    project.deadline ? String(project.deadline).slice(0, 10) : "",
  );
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
            <p className="text-sm text-destructive">
              Delete this project and all its tasks? This cannot be undone.
            </p>
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
          <div
            key={String(f.id)}
            className="flex items-center justify-between rounded-xl bg-secondary p-3"
          >
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
          <p className="text-sm text-muted-foreground">
            No viva sessions yet. Start one to practice for this project.
          </p>
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
