import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, AlertCircle, LogIn } from "lucide-react";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { useMe } from "@/lib/hooks";
import { useTeamVivaJoinPreview } from "@/lib/hooks-advanced";
import { TeamVivaRoom } from "@/components/live/team-viva-room";

export const Route = createFileRoute("/advanced/viva-team_/join/$joinCode")({
  head: () => ({ meta: [{ title: "Join Team Viva — VivAI" }] }),
  component: JoinTeamViva,
});

function JoinTeamViva() {
  const { joinCode } = Route.useParams();
  const { data: me } = useMe();
  const preview = useTeamVivaJoinPreview(joinCode);
  const profileId = (me as { id?: string } | undefined)?.id ?? null;
  const [joined, setJoined] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="Join Team Viva"
        subtitle="You've been invited to a live team viva session."
      />
      {preview.isLoading ? (
        <div className="mt-5 max-w-lg">
          <Card>
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking invite link…
            </div>
          </Card>
        </div>
      ) : preview.isError || !preview.data ? (
        <div className="mt-5 max-w-lg">
          <Card>
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {(preview.error as Error)?.message ||
                "This invite link is invalid or you're not on this team."}
            </div>
            <Link
              to="/advanced/viva-team"
              className="mt-3 inline-block text-xs font-semibold text-primary"
            >
              Start your own team viva instead
            </Link>
          </Card>
        </div>
      ) : !joined ? (
        <div className="mt-5 max-w-lg">
          <Card>
            <h3 className="text-base font-semibold">
              {String(preview.data.team_name)}'s Team Viva
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Hosted by {String(preview.data.lead_name)}
              {preview.data.subject ? ` — focused on ${String(preview.data.subject)}` : ""}.
            </p>
            <button
              onClick={() => setJoined(true)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <LogIn className="h-4 w-4" /> Join lobby
            </button>
          </Card>
        </div>
      ) : profileId ? (
        <div className="mt-5">
          <TeamVivaRoom sessionId={String(preview.data.session_id)} myProfileId={profileId} />
        </div>
      ) : null}
    </AppShell>
  );
}
