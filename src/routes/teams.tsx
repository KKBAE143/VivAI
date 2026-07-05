import { createFileRoute } from "@tanstack/react-router";
import { Plus, Users, Crown, X, Copy, Check, UserMinus, LogOut, Trash2, Pencil, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useCreateTeam,
  useDeleteTeam,
  useJoinTeam,
  useMe,
  useRemoveMember,
  useRenameTeam,
  useTeam,
  useTeams,
  useUpdateMemberRole,
  type ApiRecord,
} from "@/lib/hooks";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "My Teams — CollgePro Navigator" },
      { name: "description", content: "Manage your project teams and collaborate with classmates." },
    ],
  }),
  component: Teams,
});

function Teams() {
  useRequireAuth();
  const { data: teams, isLoading, error, refetch } = useTeams();
  const { data: me } = useMe();
  const createTeam = useCreateTeam();
  const joinTeam = useJoinTeam();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreateError("");
    try {
      await createTeam.mutateAsync({ name: name.trim() });
      setName("");
      setShowCreate(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create the team");
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoinMsg(null);
    try {
      await joinTeam.mutateAsync(code);
      setJoinCode("");
      setJoinMsg({ ok: true, text: "Joined the team." });
    } catch (e) {
      setJoinMsg({ ok: false, text: e instanceof Error ? e.message : "Invalid invite code" });
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="My Teams"
        subtitle="Manage teams across your projects."
        action={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New Team
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {showCreate && (
          <Card>
            <h3 className="text-base font-semibold">Create a team</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Team name (e.g. Code Crew)"
                className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
              <button
                disabled={createTeam.isPending || !name.trim()}
                onClick={() => void handleCreate()}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {createTeam.isPending ? "Creating…" : "Create"}
              </button>
            </div>
            {createError && <p className="mt-2 text-sm text-destructive">{createError}</p>}
          </Card>
        )}

        <Card>
          <h3 className="text-base font-semibold">Join a team</h3>
          <p className="mt-1 text-xs text-muted-foreground">Got an invite code from a teammate? Enter it here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
            <button
              disabled={joinTeam.isPending || !joinCode.trim()}
              onClick={() => void handleJoin()}
              className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {joinTeam.isPending ? "Joining…" : "Join"}
            </button>
          </div>
          {joinMsg && (
            <p className={`mt-2 text-sm ${joinMsg.ok ? "text-success" : "text-destructive"}`}>{joinMsg.text}</p>
          )}
        </Card>
      </div>

      <div className="mt-2">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} className="min-h-[200px]" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Could not load your teams"}
            onRetry={() => void refetch()}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(teams ?? []).map((t) => {
              const members = (t.team_members as ApiRecord[] | undefined) ?? [];
              const isLead = members.some((m) => m.profile_id === me?.id && m.role === "Lead");
              return (
                <button key={String(t.id)} onClick={() => setOpenTeamId(String(t.id))} className="text-left">
                  <Card className="h-full transition-transform hover:-translate-y-1">
                    <div className="flex items-center justify-between">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary">
                        <Users className="h-5 w-5" />
                      </div>
                      {isLead && (
                        <Badge tone="warning">
                          <Crown className="h-3 w-3" /> Lead
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{String(t.name)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.project_id ? "Linked to a project" : "No project linked"}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((m, i) => {
                          const profile = m.profiles as ApiRecord | null | undefined;
                          const initial = String(profile?.full_name ?? "M").charAt(0).toUpperCase();
                          return (
                            <div
                              key={i}
                              className="grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-secondary text-[10px] font-semibold"
                            >
                              {initial}
                            </div>
                          );
                        })}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {members.length} member{members.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Card>
                </button>
              );
            })}
            <button onClick={() => setShowCreate(true)} className="text-left">
              <Card className="flex min-h-[200px] flex-col items-center justify-center border-2 border-dashed border-border bg-transparent shadow-none transition-colors hover:border-primary">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="mt-3 text-sm font-semibold">Create new team</div>
                <div className="mt-1 text-xs text-muted-foreground">Invite classmates & start</div>
              </Card>
            </button>
          </div>
        )}
      </div>

      {openTeamId && (
        <TeamDetailModal teamId={openTeamId} meId={me?.id ? String(me.id) : null} onClose={() => setOpenTeamId(null)} />
      )}
    </AppShell>
  );
}

function TeamDetailModal({
  teamId,
  meId,
  onClose,
}: {
  teamId: string;
  meId: string | null;
  onClose: () => void;
}) {
  const { data: team, isLoading } = useTeam(teamId);
  const removeMember = useRemoveMember();
  const updateRole = useUpdateMemberRole();
  const renameTeam = useRenameTeam();
  const deleteTeam = useDeleteTeam();

  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const members = (team?.team_members as ApiRecord[] | undefined) ?? [];
  const myRole = members.find((m) => String(m.profile_id) === meId)?.role;
  const isLead = myRole === "Lead";
  const inviteCode = team?.invite_code ? String(team.invite_code) : "";

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the code.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() =>
                    void run(async () => {
                      if (newName.trim()) await renameTeam.mutateAsync({ teamId, name: newName.trim() });
                      setEditingName(false);
                    })
                  }
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-bold">{isLoading ? "Loading…" : String(team?.name ?? "Team")}</h2>
                {isLead && (
                  <button
                    onClick={() => {
                      setNewName(String(team?.name ?? ""));
                      setEditingName(true);
                    }}
                    aria-label="Rename team"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {inviteCode && (
          <div className="mt-4 rounded-xl border border-border p-3">
            <div className="text-xs font-medium text-muted-foreground">Invite code</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold tracking-wider">{inviteCode}</code>
              <button
                onClick={() => void copyCode()}
                className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Share this code with classmates so they can join.</p>
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-semibold">Members</h3>
          <div className="mt-2 space-y-2">
            {members.map((m) => {
              const profile = m.profiles as ApiRecord | null | undefined;
              const fullName = String(profile?.full_name ?? "Member");
              const pid = String(m.profile_id);
              const role = String(m.role ?? "Member");
              const isMe = pid === meId;
              return (
                <div key={pid} className="flex items-center justify-between rounded-xl border border-border p-2.5">
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
                            if (isMe) onClose();
                          })
                        }
                        aria-label={isMe ? "Leave team" : "Remove member"}
                        title={isMe ? "Leave team" : "Remove member"}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-destructive hover:bg-destructive/10"
                      >
                        {isMe ? <LogOut className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {isLead && (
          <button
            onClick={() =>
              void run(async () => {
                if (!window.confirm("Delete this team for everyone? This cannot be undone.")) return;
                await deleteTeam.mutateAsync(teamId);
                onClose();
              })
            }
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> Delete team
          </button>
        )}
      </div>
    </div>
  );
}
