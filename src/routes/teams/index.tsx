import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Users, Crown } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateTeam, useJoinTeam, useMe, useTeams, type ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/teams/")({
  head: () => ({
    meta: [
      { title: "My Teams — VivAI" },
      {
        name: "description",
        content: "Manage your project teams and collaborate with classmates.",
      },
    ],
  }),
  component: Teams,
});

const PAGE_SIZE = 5;

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
  const [page, setPage] = useState(1);

  const allTeams = teams ?? [];
  const totalPages = Math.max(1, Math.ceil(allTeams.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleTeams = allTeams.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              My Teams
            </h1>
            <p className="text-xs text-muted-foreground">
              Collaborate and manage teams across your projects.
            </p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs sm:text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> {showCreate ? "Close" : "New Team"}
          </button>
        </div>

        {/* Action Row: Create & Join Cards */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {showCreate && (
            <Card className="p-3.5">
              <h3 className="text-xs sm:text-sm font-semibold">Create a team</h3>
              <div className="mt-2 flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Team name (e.g. Code Crew)"
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
                <button
                  disabled={createTeam.isPending || !name.trim()}
                  onClick={() => void handleCreate()}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {createTeam.isPending ? "Creating…" : "Create"}
                </button>
              </div>
              {createError && <p className="mt-1 text-xs text-destructive">{createError}</p>}
            </Card>
          )}

          <Card className={`p-3.5 ${!showCreate ? "sm:col-span-2" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-semibold">Join with invite code</h3>
                <p className="text-[11px] text-muted-foreground">
                  Got an invite code from a teammate? Enter it here.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Invite code"
                  className="w-36 rounded-lg border border-border bg-card px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
                <button
                  disabled={joinTeam.isPending || !joinCode.trim()}
                  onClick={() => void handleJoin()}
                  className="rounded-lg bg-foreground px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
                >
                  {joinTeam.isPending ? "Joining…" : "Join"}
                </button>
              </div>
            </div>
            {joinMsg && (
              <p className={`mt-1.5 text-xs ${joinMsg.ok ? "text-success" : "text-destructive"}`}>
                {joinMsg.text}
              </p>
            )}
          </Card>
        </div>

        {/* Teams Grid */}
        <Card className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Teams Roster</h3>
              {allTeams.length > 0 && <Badge tone="muted">{allTeams.length} total</Badge>}
            </div>
            {isLoading ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={i} className="h-28" />
                ))}
              </div>
            ) : error ? (
              <ErrorState
                message={error instanceof Error ? error.message : "Could not load your teams"}
                onRetry={() => void refetch()}
              />
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {visibleTeams.map((t) => {
                  const members = (t.team_members as ApiRecord[] | undefined) ?? [];
                  const isLead = members.some((m) => m.profile_id === me?.id && m.role === "Lead");
                  return (
                    <button
                      key={String(t.id)}
                      onClick={() =>
                        void navigate({ to: "/teams/$id", params: { id: String(t.id) } })
                      }
                      className="group rounded-xl border border-border p-3.5 text-left transition-all hover:border-primary bg-card/60 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Users className="h-4 w-4" />
                          </div>
                          {isLead && <Badge tone="primary">Lead</Badge>}
                        </div>
                        <div className="mt-2 text-xs sm:text-sm font-semibold group-hover:text-primary transition-colors truncate">
                          {String(t.name)}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                          {t.project_id ? "Linked to a project" : "No project linked"}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                        <span>
                          {members.length} member{members.length === 1 ? "" : "s"}
                        </span>
                        {Boolean(t.invite_code) && (
                          <span className="font-mono text-[10px] bg-secondary px-1.5 py-0.5 rounded font-semibold text-foreground">
                            {String(t.invite_code)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowCreate(true)}
                  className="rounded-xl border-2 border-dashed border-border p-3.5 text-center flex flex-col items-center justify-center transition-colors hover:border-primary bg-transparent"
                >
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div className="mt-2 text-xs font-semibold">Create new team</div>
                  <div className="text-[10px] text-muted-foreground">Invite classmates</div>
                </button>
              </div>
            )}
          </div>
          {allTeams.length > 0 && (
            <DataPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={allTeams.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="teams"
              className="mt-2 pt-2"
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
