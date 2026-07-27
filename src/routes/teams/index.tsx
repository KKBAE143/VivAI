import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Users, Crown } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateTeam, useJoinTeam, useMe, useTeams, type ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/teams/")({
  head: () => ({
    meta: [
      { title: "My Teams — CollgePro Navigator" },
      {
        name: "description",
        content: "Manage your project teams and collaborate with classmates.",
      },
    ],
  }),
  component: Teams,
});

function Teams() {
  useRequireAuth();
  const navigate = useNavigate();
  const { data: teams, isLoading, error, refetch } = useTeams();
  const { data: me } = useMe();
  const createTeam = useCreateTeam();
  const joinTeam = useJoinTeam();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
          <p className="mt-1 text-xs text-muted-foreground">
            Got an invite code from a teammate? Enter it here.
          </p>
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
            <p className={`mt-2 text-sm ${joinMsg.ok ? "text-success" : "text-destructive"}`}>
              {joinMsg.text}
            </p>
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
                <button
                  key={String(t.id)}
                  onClick={() => void navigate({ to: "/teams/$id", params: { id: String(t.id) } })}
                  className="text-left"
                >
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
                          const initial = String(profile?.full_name ?? "M")
                            .charAt(0)
                            .toUpperCase();
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
    </AppShell>
  );
}
