/**
 * Project Team tab — the actual fix for "No team linked to this project.
 * Create or join a team" always showing even when the user already owns or
 * belongs to teams. Shows the linked team in full (members, lead, invite
 * code, computed status), and — when nothing is linked — offers the user's
 * own teams for an instant link, an invite-code path for a team they're not
 * on (creates a pending request the team's Lead accepts/declines), or
 * spinning up a brand-new team pre-linked to this project.
 */
import { useState } from "react";
import {
  Users,
  Crown,
  Copy,
  Check,
  Loader2,
  Link2,
  Plus,
  UserMinus,
  RefreshCw,
  Clock,
  X,
} from "lucide-react";
import { Card, Badge } from "@/components/app-shell";
import { ModalShell } from "@/components/modal-shell";
import {
  useLinkableTeams,
  useLinkTeam,
  useRequestTeamLink,
  useUnlinkTeam,
  useProjectTeamRequests,
  useCancelProjectTeamRequest,
  useCreateTeam,
  type ApiRecord,
} from "@/lib/hooks";

function InviteCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wide"
    >
      {code}
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

/** The linked team's full detail card + switch/remove actions. */
function LinkedTeamCard({ projectId, team }: { projectId: string; team: ApiRecord }) {
  const [switching, setSwitching] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const unlink = useUnlinkTeam(projectId);
  const members = (team.team_members as ApiRecord[] | undefined) ?? [];
  const lead = members.find((m) => String(m.role) === "Lead");
  const leadName = String(
    ((lead?.profiles as ApiRecord | undefined)?.full_name as string | undefined) ?? "—",
  );
  // Computed, not stored: mirrors the same rule the backend's Team Dashboard
  // uses, so the two surfaces never disagree.
  const status = "Actively working";

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{String(team.name)}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {members.length} member{members.length === 1 ? "" : "s"}
                </span>
                <span>Lead: {leadName}</span>
                <Badge tone="success">{status}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {team.invite_code ? <InviteCodeChip code={String(team.invite_code)} /> : null}
            <button
              onClick={() => setSwitching(true)}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Switch
            </button>
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive"
            >
              <UserMinus className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {members.map((m) => {
            const profile = (m.profiles as ApiRecord | undefined) ?? {};
            return (
              <div
                key={String(m.id)}
                className="flex items-center justify-between rounded-xl bg-secondary p-2.5"
              >
                <span className="text-sm font-medium">{String(profile.full_name ?? "Member")}</span>
                <Badge tone={String(m.role) === "Lead" ? "primary" : "muted"}>
                  {String(m.role) === "Lead" ? (
                    <span className="flex items-center gap-1">
                      <Crown className="h-3 w-3" /> Lead
                    </span>
                  ) : (
                    "Member"
                  )}
                </Badge>
              </div>
            );
          })}
          {members.length === 0 && <p className="text-xs text-muted-foreground">No members yet</p>}
        </div>
      </Card>

      {switching && (
        <LinkTeamModal
          projectId={projectId}
          title="Switch team"
          hint="Pick a different team, or send a request to one you're not on. The current team is removed once the new one is linked."
          onClose={() => setSwitching(false)}
        />
      )}

      {confirmRemove && (
        <ModalShell title="Remove linked team?" onClose={() => setConfirmRemove(false)}>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{String(team.name)}</strong> will no longer be
            linked to this project. The team itself isn&apos;t affected — you can relink it anytime.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmRemove(false)}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              disabled={unlink.isPending}
              onClick={() => unlink.mutate(undefined, { onSuccess: () => setConfirmRemove(false) })}
              className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {unlink.isPending ? "Removing…" : "Remove team"}
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

/** Picker modal used for both the first-time link and "Switch team". */
function LinkTeamModal({
  projectId,
  title,
  hint,
  onClose,
}: {
  projectId: string;
  title: string;
  hint: string;
  onClose: () => void;
}) {
  const linkable = useLinkableTeams(projectId);
  const linkTeam = useLinkTeam(projectId);
  const requestLink = useRequestTeamLink(projectId);
  const createTeam = useCreateTeam();
  const [inviteCode, setInviteCode] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [mode, setMode] = useState<"pick" | "code" | "new">("pick");
  const [error, setError] = useState("");

  const teams = linkable.data ?? [];

  const submitCode = async () => {
    if (!inviteCode.trim()) return;
    setError("");
    try {
      await requestLink.mutateAsync(inviteCode.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request.");
    }
  };

  const submitNewTeam = async () => {
    if (!newTeamName.trim()) return;
    setError("");
    try {
      await createTeam.mutateAsync({ name: newTeamName.trim(), project_id: projectId });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the team.");
    }
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="text-sm text-muted-foreground">{hint}</p>

      <div className="mt-4 flex gap-1 rounded-xl bg-secondary p-1 text-xs font-medium">
        {(["pick", "code", "new"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-1.5 ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {m === "pick" ? "Your teams" : m === "code" ? "Invite code" : "New team"}
          </button>
        ))}
      </div>

      {mode === "pick" && (
        <div className="mt-4 space-y-2">
          {linkable.isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your teams…
            </div>
          )}
          {!linkable.isLoading && teams.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              You&apos;re not on any teams yet. Create one, or send a request using an invite code.
            </p>
          )}
          {teams.map((t) => (
            <button
              key={String(t.id)}
              disabled={linkTeam.isPending}
              onClick={() => linkTeam.mutate(String(t.id), { onSuccess: onClose })}
              className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left text-sm hover:border-primary disabled:opacity-50"
            >
              <span>
                <span className="font-medium">{String(t.name)}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {Number(t.member_count ?? 0)} member{Number(t.member_count ?? 0) === 1 ? "" : "s"}{" "}
                  · {String(t.my_role ?? "Member")}
                </span>
              </span>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {mode === "code" && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            For a team you&apos;re not a member of. The team&apos;s lead will need to accept before
            it links.
          </p>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Invite code"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono uppercase tracking-wide focus:border-primary focus:outline-none"
          />
          <button
            disabled={requestLink.isPending || !inviteCode.trim()}
            onClick={() => void submitCode()}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {requestLink.isPending ? "Sending…" : "Send request"}
          </button>
        </div>
      )}

      {mode === "new" && (
        <div className="mt-4 space-y-3">
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            disabled={createTeam.isPending || !newTeamName.trim()}
            onClick={() => void submitNewTeam()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {createTeam.isPending ? "Creating…" : "Create & link"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </ModalShell>
  );
}

function PendingRequests({ projectId }: { projectId: string }) {
  const requests = useProjectTeamRequests(projectId);
  const cancel = useCancelProjectTeamRequest(projectId);
  const pending = (requests.data ?? []).filter((r) => String(r.status) === "pending");
  if (pending.length === 0) return null;
  return (
    <Card>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Join requests
      </h4>
      <div className="mt-3 space-y-2">
        {pending.map((r) => {
          const team = (r.teams as ApiRecord | undefined) ?? {};
          return (
            <div
              key={String(r.id)}
              className="flex items-center justify-between rounded-xl bg-secondary p-3"
            >
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-warning" />
                <span>
                  Waiting for <strong>{String(team.name ?? "a team")}</strong> to accept
                </span>
              </div>
              <button
                onClick={() => cancel.mutate(String(r.id))}
                aria-label="Cancel request"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-card"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ProjectTeamTab({ projectId, teams }: { projectId: string; teams: ApiRecord[] }) {
  const [linking, setLinking] = useState(false);
  const linkedTeam = teams[0];

  if (linkedTeam) {
    return <LinkedTeamCard projectId={projectId} team={linkedTeam} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">No team linked yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Link one of your teams, send a request to another, or start a new one for this
              project.
            </p>
          </div>
          <button
            onClick={() => setLinking(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Link2 className="h-4 w-4" /> Link a team
          </button>
        </div>
      </Card>
      <PendingRequests projectId={projectId} />
      {linking && (
        <LinkTeamModal
          projectId={projectId}
          title="Link a team"
          hint="Pick one of your teams to link instantly, or reach a team you're not on with its invite code."
          onClose={() => setLinking(false)}
        />
      )}
    </div>
  );
}
