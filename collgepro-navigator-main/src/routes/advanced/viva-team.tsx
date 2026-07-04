import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Play, Send, Trophy } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useMe, useTeams } from "@/lib/hooks";
import { useTeamVivaSocket, type TeamVivaMessage } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/viva-team")({
  head: () => ({ meta: [{ title: "Team Viva — CollgePro Navigator" }] }),
  component: TeamViva,
});

function TeamViva() {
  const { data: me } = useMe();
  const { data: teams } = useTeams();
  const [teamId, setTeamId] = useState("");
  const [subject, setSubject] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const profileId = (me as { id?: string } | undefined)?.id ?? null;
  const { messages, connected, send } = useTeamVivaSocket(sessionId, profileId);

  const lastOf = (type: string) => [...messages].reverse().find((m) => m.type === type);
  const question = lastOf("question");
  const lobby = lastOf("lobby");
  const scoreboard = (lastOf("answer_scored")?.scoreboard ?? []) as Record<string, unknown>[];
  const feed = messages.filter((m) => m.type === "answer_scored").slice(-8);

  const createSession = async () => {
    const session = await api<{ id: string }>("/api/advanced/team-viva/sessions", {
      body: { team_id: teamId, subject: subject || null },
    });
    setSessionId(session.id);
  };

  const endSession = async () => {
    if (!sessionId) return;
    await api(`/api/advanced/team-viva/${sessionId}/end`, { method: "POST" });
    setSessionId(null);
  };

  return (
    <AppShell>
      <PageHeader title="Team Viva Mode" subtitle="Your whole team sits the viva together — first to answer scores highest." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" /> Lobby</h3>
          {!sessionId ? (
            <div className="mt-3 space-y-3">
              <select className="w-full rounded-lg border bg-background p-2 text-sm" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Select your team</option>
                {(teams ?? []).map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>{String(t.name)}</option>
                ))}
              </select>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (e.g. DBMS)" className="w-full rounded-lg border bg-background p-2 text-sm" />
              <button disabled={!teamId} onClick={createSession} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Play className="h-4 w-4" /> Create Session
              </button>
              <p className="text-xs text-muted-foreground">Teammates join by opening this page with the same session (share the session ID).</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <Badge tone={connected ? "success" : "warning"}>{connected ? "Connected" : "Connecting…"}</Badge>
              <p className="text-xs text-muted-foreground">Session: {sessionId}</p>
              <div>
                {((lobby?.members ?? []) as { profile_id: string; name: string }[]).map((m) => (
                  <div key={m.profile_id} className="rounded-lg border p-2 text-sm">{m.name}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => send({ type: "start" })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Ask Question</button>
                <button onClick={() => send({ type: "next" })} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Next</button>
                <button onClick={endSession} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">End</button>
              </div>
            </div>
          )}
        </Card>
        <Card className="lg:col-span-5">
          <h3 className="text-base font-semibold">Live Q&A</h3>
          {question && <p className="mt-3 rounded-lg bg-muted p-3 text-sm font-medium">{String(question.question)}</p>}
          <div className="mt-3 flex gap-2">
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer fast…" className="flex-1 rounded-lg border bg-background p-2 text-sm" />
            <button
              disabled={!answer.trim() || !question}
              onClick={() => { send({ type: "answer", text: answer }); setAnswer(""); }}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {feed.map((m: TeamVivaMessage, i) => (
              <div key={i} className="rounded-lg border p-2 text-xs">
                <span className="font-semibold">{String(m.name)}</span>{" "}
                {m.first ? "answered first" : m.correction ? "added a correction" : "answered"} — {String(m.points_awarded)} pts
                <p className="mt-1 text-muted-foreground">{String(m.feedback ?? "")}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Trophy className="h-4 w-4" /> Scoreboard</h3>
          <div className="mt-3 space-y-2">
            {scoreboard.map((s, i) => (
              <div key={String(s.profile_id)} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span>#{i + 1} {String(s.name)}</span>
                <span className="font-bold">{String(s.score_total)}</span>
              </div>
            ))}
            {!scoreboard.length && <p className="text-xs text-muted-foreground">Scores appear after the first answer.</p>}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
