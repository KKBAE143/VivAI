import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Users,
  Crown,
  Copy,
  Check,
  Pencil,
  Trash2,
  UserMinus,
  LogOut,
  ArrowUpDown,
  FolderKanban,
  ListChecks,
  Activity as ActivityIcon,
  Settings as SettingsIcon,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { ProjectDetailSkeleton } from "@/components/loading-skeleton";
import { ModalShell } from "@/components/modal-shell";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useAcceptTeamRequest,
  useDeclineTeamRequest,
  useDeleteTeam,
  useMe,
  useRemoveMember,
  useRenameTeam,
  useTeam,
  useTeamActivity,
  useTeamIncomingRequests,
  useUpdateMemberRole,
  type ApiRecord,
} from "@/lib/hooks";

export const Route = createFileRoute("/teams/$id")({
  head: () => ({ meta: [{ title: "Team Dashboard — VivAI" }] }),
  component: TeamDashboard,
});

const TABS = ["Overview", "Members", "Projects", "Tasks", "Activity", "Settings"] as const;
type Tab = (typeof TABS)[number];

function TeamDashboard() {
  useRequireAuth();
  const { id } = Route.useParams();
  const { data: team, isLoading, error, refetch } = useTeam(id);
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>("Overview");

  if (isLoading) return <ProjectDetailSkeleton />;
  if (error || !team) {
    return (
      <AppShell>
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load this team"}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );
  }

  const members = (team.team_members as ApiRecord[] | undefined) ?? [];
  const myRole = members.find((m) => String(m.profile_id) === (me?.id ? String(me.id) : ""))?.role;
  const isLead = myRole === "Lead";

  return (
    <AppShell>
      <div className="flex items-start gap-3">
        <Link
          to="/teams"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{String(team.name)}</h1>
            <Badge tone={team.status === "Actively working" ? "success" : "muted"}>
              {String(team.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {Number(team.member_count ?? members.length)} member
            {Number(team.member_count ?? members.length) === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <Card className="mt-5 !p-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
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

      <div className="mt-5">
        {tab === "Overview" && <OverviewTab team={team} isLead={isLead} />}
        {tab === "Members" && (
          <MembersTab
            teamId={id}
            team={team}
            meId={me?.id ? String(me.id) : null}
            isLead={isLead}
          />
        )}
        {tab === "Projects" && <ProjectsTab team={team} />}
        {tab === "Tasks" && <TasksTab team={team} />}
        {tab === "Activity" && <ActivityTab teamId={id} />}
        {tab === "Settings" && <SettingsTab teamId={id} team={team} isLead={isLead} />}
      </div>
    </AppShell>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function OverviewTab({ team, isLead }: { team: ApiRecord; isLead: boolean }) {
  const workload = (team.workload as ApiRecord[] | undefined) ?? [];
  const recentActivity = (team.recent_activity as ApiRecord[] | undefined) ?? [];
  const activeProjects = (team.active_projects as ApiRecord[] | undefined) ?? [];
  const completedProjects = (team.completed_projects as ApiRecord[] | undefined) ?? [];
  const incoming = useTeamIncomingRequests(String(team.id));
  const accept = useAcceptTeamRequest(String(team.id));
  const decline = useDeclineTeamRequest(String(team.id));
  const pendingRequests = (incoming.data ?? []).filter((r) => String(r.status) === "pending");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-8">
        <Card>
          <h3 className="text-sm font-semibold">At a glance</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Active projects" value={activeProjects.length} />
            <StatTile label="Completed" value={completedProjects.length} />
            <StatTile label="Members" value={Number(team.member_count ?? 0)} />
            <StatTile
              label="Open tasks"
              value={workload.reduce(
                (sum, w) => sum + Number(w.total ?? 0) - Number(w.done ?? 0),
                0,
              )}
            />
          </div>
        </Card>

        {isLead && pendingRequests.length > 0 && (
          <Card className="border border-warning/30">
            <h3 className="text-sm font-semibold">Project requests awaiting your decision</h3>
            <div className="mt-3 space-y-2">
              {pendingRequests.map((r) => {
                const project = (r.projects as ApiRecord | undefined) ?? {};
                return (
                  <div
                    key={String(r.id)}
                    className="flex items-center justify-between rounded-xl bg-secondary p-3"
                  >
                    <div className="text-sm">
                      <span className="font-medium">{String(project.title ?? "A project")}</span>{" "}
                      <span className="text-xs text-muted-foreground">wants to link this team</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => decline.mutate(String(r.id))}
                        className="rounded-lg bg-card px-3 py-1.5 text-xs font-medium"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => accept.mutate(String(r.id))}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card>
          <h3 className="text-sm font-semibold">Recent activity</h3>
          <div className="mt-3 space-y-2">
            {recentActivity.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            )}
            {recentActivity.map((a) => (
              <ActivityRow key={String(a.id)} entry={a} />
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-5 lg:col-span-4">
        <Card>
          <h3 className="text-sm font-semibold">Workload</h3>
          <div className="mt-3 space-y-3">
            {workload.map((w) => {
              const total = Number(w.total ?? 0);
              const done = Number(w.done ?? 0);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={String(w.profile_id)}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">{String(w.name)}</span>
                    <span className="text-muted-foreground">
                      {done}/{total} done
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {workload.length === 0 && (
              <p className="text-xs text-muted-foreground">No tasks assigned yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ApiRecord }) {
  const profile = (entry.profiles as ApiRecord | undefined) ?? {};
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-secondary p-2.5 text-sm">
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card text-[10px] font-semibold">
        {String(profile.full_name ?? "?")
          .charAt(0)
          .toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="leading-snug">{String(entry.activity_text)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {entry.created_at ? new Date(String(entry.created_at)).toLocaleString() : ""}
        </p>
      </div>
    </div>
  );
}

function MembersTab({
  teamId,
  team,
  meId,
  isLead,
}: {
  teamId: string;
  team: ApiRecord;
  meId: string | null;
  isLead: boolean;
}) {
  const removeMember = useRemoveMember();
  const updateRole = useUpdateMemberRole();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const members = (team.team_members as ApiRecord[] | undefined) ?? [];
  const inviteCode = team.invite_code ? String(team.invite_code) : "";

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <div className="space-y-4">
      {inviteCode && (
        <Card>
          <div className="text-xs font-medium text-muted-foreground">Invite code</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <code className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold tracking-wider">
              {inviteCode}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(inviteCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Card>
      )}
      <Card>
        <h3 className="text-sm font-semibold">Members</h3>
        <div className="mt-3 space-y-2">
          {members.map((m) => {
            const profile = m.profiles as ApiRecord | null | undefined;
            const fullName = String(profile?.full_name ?? "Member");
            const pid = String(m.profile_id);
            const role = String(m.role ?? "Member");
            const isMe = pid === meId;
            return (
              <div
                key={pid}
                className="flex items-center justify-between rounded-xl border border-border p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                    {fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {fullName}
                      {isMe ? " (You)" : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {role}
                      {profile?.branch ? ` · ${String(profile.branch)}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isLead && !isMe && (
                    <button
                      onClick={() =>
                        void run(() =>
                          updateRole.mutateAsync({
                            teamId,
                            profileId: pid,
                            role: role === "Lead" ? "Member" : "Lead",
                          }),
                        )
                      }
                      aria-label="Toggle role"
                      title={role === "Lead" ? "Demote to Member" : "Promote to Lead"}
                      className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {(isLead || isMe) && (
                    <button
                      onClick={() =>
                        void run(async () => {
                          if (isMe && !window.confirm("Leave this team?")) return;
                          await removeMember.mutateAsync({ teamId, profileId: pid });
                        })
                      }
                      aria-label={isMe ? "Leave team" : "Remove member"}
                      title={isMe ? "Leave team" : "Remove member"}
                      className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive hover:bg-destructive/10"
                    >
                      {isMe ? (
                        <LogOut className="h-3.5 w-3.5" />
                      ) : (
                        <UserMinus className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </Card>
    </div>
  );
}

function ProjectsTab({ team }: { team: ApiRecord }) {
  const active = (team.active_projects as ApiRecord[] | undefined) ?? [];
  const completed = (team.completed_projects as ApiRecord[] | undefined) ?? [];

  const ProjectRow = ({ p }: { p: ApiRecord }) => (
    <Link
      to="/projects/$id"
      params={{ id: String(p.id) }}
      className="flex items-center justify-between rounded-xl border border-border p-3 hover:border-primary"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{String(p.title)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {String(p.type)} · {p.deadline ? `Due ${String(p.deadline).slice(0, 10)}` : "No deadline"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Number(p.progress ?? 0)}%` }}
          />
        </div>
        <span className="text-xs font-medium">{Number(p.progress ?? 0)}%</span>
      </div>
    </Link>
  );

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold">Active projects</h3>
        <div className="mt-3 space-y-2">
          {active.length === 0 && (
            <p className="text-xs text-muted-foreground">No active projects right now.</p>
          )}
          {active.map((p) => (
            <ProjectRow key={String(p.id)} p={p} />
          ))}
        </div>
      </Card>
      {completed.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold">Completed</h3>
          <div className="mt-3 space-y-2">
            {completed.map((p) => (
              <ProjectRow key={String(p.id)} p={p} />
            ))}
          </div>
        </Card>
      )}
      {active.length === 0 && completed.length === 0 && (
        <Card>
          <div className="flex flex-col items-center py-6 text-center">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              This team isn&apos;t linked to a project yet. Link it from a project&apos;s Team tab.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function TasksTab({ team }: { team: ApiRecord }) {
  const tasks = (team.tasks as ApiRecord[] | undefined) ?? [];
  const projects = (team.projects as ApiRecord[] | undefined) ?? [];
  const projectTitle = (id: unknown) => projects.find((p) => p.id === id)?.title ?? "";
  const members = (team.team_members as ApiRecord[] | undefined) ?? [];
  const nameOf = (assigneeId: unknown) => {
    const m = members.find((mm) => mm.profile_id === assigneeId);
    return m ? String((m.profiles as ApiRecord | undefined)?.full_name ?? "Member") : "Unassigned";
  };
  const toneFor = (status: string) =>
    status === "Done"
      ? "success"
      : status === "Review"
        ? "warning"
        : status === "In Progress"
          ? "primary"
          : "muted";

  if (tasks.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center py-6 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No tasks on this team&apos;s current projects yet.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold">Tasks across current projects</h3>
      <div className="mt-3 space-y-2">
        {tasks.map((t) => (
          <div
            key={String(t.id)}
            className="flex items-center justify-between gap-3 rounded-xl border border-border p-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{String(t.title)}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {projectTitle(t.project_id) ? `${projectTitle(t.project_id)} · ` : ""}
                {nameOf(t.assignee_id)}
              </div>
            </div>
            <Badge tone={toneFor(String(t.status))}>{String(t.status)}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActivityTab({ teamId }: { teamId: string }) {
  const { data, isLoading } = useTeamActivity(teamId);
  const entries = data ?? [];
  return (
    <Card>
      <div className="flex items-center gap-2">
        <ActivityIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Activity</h3>
      </div>
      <div className="mt-3 space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && entries.length === 0 && (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        )}
        {entries.map((a) => (
          <ActivityRow key={String(a.id)} entry={a} />
        ))}
      </div>
    </Card>
  );
}

function SettingsTab({
  teamId,
  team,
  isLead,
}: {
  teamId: string;
  team: ApiRecord;
  isLead: boolean;
}) {
  const navigate = useNavigate();
  const renameTeam = useRenameTeam();
  const deleteTeam = useDeleteTeam();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(String(team.name ?? ""));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  if (!isLead) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SettingsIcon className="h-4 w-4" /> Only the team lead can change settings.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold">Team name</h3>
        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={!editingName}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
          {editingName ? (
            <button
              onClick={async () => {
                setError("");
                try {
                  if (newName.trim())
                    await renameTeam.mutateAsync({ teamId, name: newName.trim() });
                  setEditingName(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not rename the team");
                }
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Check className="h-4 w-4" /> Save
            </button>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              <Pencil className="h-4 w-4" /> Rename
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      <Card className="border border-destructive/30">
        <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Deleting this team removes it for every member. Any linked project just loses its team —
          the project itself is not affected.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          className="mt-3 flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> Delete team
        </button>
      </Card>

      {confirmDelete && (
        <ModalShell title="Delete this team?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-muted-foreground">
            This cannot be undone. <strong className="text-foreground">{String(team.name)}</strong>{" "}
            and its membership will be permanently removed.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await deleteTeam.mutateAsync(teamId);
                void navigate({ to: "/teams" });
              }}
              className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
            >
              Delete team
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
