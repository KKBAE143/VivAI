import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Play } from "lucide-react";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { useMe, useTeams } from "@/lib/hooks";
import { useCreateTeamViva } from "@/lib/hooks-advanced";
import { TeamVivaRoom } from "@/components/live/team-viva-room";

export const Route = createFileRoute("/advanced/viva-team")({
  head: () => ({ meta: [{ title: "Team Viva — CollgePro Navigator" }] }),
  component: TeamViva,
});

function TeamViva() {
  const { data: me } = useMe();
  const { data: teams } = useTeams();
  const createSession = useCreateTeamViva();
  const [teamId, setTeamId] = useState("");
  const [subject, setSubject] = useState("");
  const [session, setSession] = useState<{ id: string; join_code: string } | null>(null);

  const profileId = (me as { id?: string } | undefined)?.id ?? null;

  return (
    <AppShell>
      <PageHeader
        title="Team Viva Mode"
        subtitle="Create a lobby, share the invite link, and let the AI examiner call on your team one at a time — by voice."
      />
      {!session ? (
        <Card className="mt-5 max-w-lg">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4" /> Create a lobby
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Only a team lead can start a team viva lobby. Once created, you'll get a link to share
            with your teammates.
          </p>
          <div className="mt-4 space-y-3">
            <select
              className="w-full rounded-lg border bg-background p-2 text-sm"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Select your team</option>
              {(teams ?? []).map((t) => (
                <option key={String(t.id)} value={String(t.id)}>
                  {String(t.name)}
                </option>
              ))}
            </select>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (e.g. DBMS) — optional"
              className="w-full rounded-lg border bg-background p-2 text-sm"
            />
            {createSession.isError && (
              <p className="text-xs text-destructive">
                {(createSession.error as Error)?.message || "Could not create the lobby."}
              </p>
            )}
            <button
              disabled={!teamId || createSession.isPending}
              onClick={() =>
                createSession.mutate(
                  { team_id: teamId, subject: subject || null },
                  {
                    onSuccess: (s) =>
                      setSession({ id: String(s.id), join_code: String(s.join_code) }),
                  },
                )
              }
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Create Lobby
            </button>
          </div>
        </Card>
      ) : profileId ? (
        <div className="mt-5">
          <TeamVivaRoom
            sessionId={session.id}
            myProfileId={profileId}
            inviteUrl={`${window.location.origin}/advanced/viva-team/join/${session.join_code}`}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
