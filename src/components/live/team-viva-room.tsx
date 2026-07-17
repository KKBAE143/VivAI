/**
 * TeamVivaRoom — the shared lobby + live-voice room UI for Team Viva.
 *
 * Used by both the lead's create page and a teammate's join-link page once
 * they have a sessionId and their own profileId: mic preflight, then lobby
 * (roster + invite link + Start button), then the live floor-controlled
 * voice session, then the ended summary.
 */
import { useEffect, useState } from "react";
import { Bot, Copy, Crown, Mic, MicOff, PhoneOff, Trophy, Loader2, CheckCircle2 } from "lucide-react";
import { Badge, Card } from "@/components/app-shell";
import { PreflightSetup } from "@/components/live/preflight-setup";
import { useTeamViva } from "@/lib/useTeamViva";

interface TeamVivaRoomProps {
  sessionId: string;
  myProfileId: string;
  inviteUrl?: string;
}

export function TeamVivaRoom({ sessionId, myProfileId, inviteUrl }: TeamVivaRoomProps) {
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [language, setLanguage] = useState("English");
  const [persona, setPersona] = useState("balanced");
  const [copied, setCopied] = useState(false);

  const room = useTeamViva({ sessionId, myProfileId, language, persona });
  const { status, members, leadId, aiStatus, floorSpeakerId, aiSpeaking, micMuted, events, summary, error, isMyFloor } = room;

  useEffect(() => {
    if (micStream && status === "idle") {
      void room.join(micStream);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micStream, status]);

  const nameFor = (pid: string | null) => members.find((m) => m.profile_id === pid)?.name ?? "Someone";
  const isLead = leadId === myProfileId;
  const canStart = members.length >= 3 && members.length <= 5;

  if (!micStream) {
    return (
      <PreflightSetup
        mode="team_viva"
        onReady={(r) => {
          setLanguage(r.language);
          setPersona(r.persona);
          setMicStream(r.micStream);
        }}
      />
    );
  }

  if (status === "connecting" || status === "idle") {
    return (
      <Card>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Joining the lobby…
        </div>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <p className="text-sm text-destructive">{error || "Something went wrong."}</p>
      </Card>
    );
  }

  if (status === "ended") {
    const memberResults = summary?.members ?? [];
    return (
      <Card>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="h-4 w-4" /> Team Viva Complete
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">Team score: {summary?.team_score ?? 0}%</p>
        <div className="mt-4 space-y-2">
          {memberResults.map((m) => (
            <div key={m.profile_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span className="font-medium">{m.name}</span>
              <span className="text-muted-foreground">
                {m.questions_answered} question{m.questions_answered === 1 ? "" : "s"} — {m.individual_score}%
              </span>
            </div>
          ))}
          {!memberResults.length && (
            <p className="text-xs text-muted-foreground">No one answered a question, so there's nothing to score.</p>
          )}
        </div>
      </Card>
    );
  }

  // status is "lobby" or "live"
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Card className="lg:col-span-8">
        <h3 className="text-base font-semibold">{status === "lobby" ? "Lobby" : "Live Team Viva"}</h3>

        {inviteUrl && status === "lobby" && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-secondary px-3 py-2 text-xs">
            <span className="flex-1 truncate text-muted-foreground">{inviteUrl}</span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {members.map((m) => {
            const speaking = status === "live" && floorSpeakerId === m.profile_id;
            return (
              <div
                key={m.profile_id}
                className={`rounded-xl border p-3 text-center text-sm transition-colors ${
                  speaking ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                <div className="flex items-center justify-center gap-1 font-medium">
                  {m.profile_id === leadId && <Crown className="h-3.5 w-3.5 text-warning" />}
                  {m.name}
                </div>
                <Badge tone={speaking ? "primary" : "muted"}>
                  {speaking ? "Speaking" : status === "lobby" ? "In lobby" : "Muted"}
                </Badge>
              </div>
            );
          })}
          <div className={`rounded-xl border p-3 text-center text-sm ${aiSpeaking ? "border-primary bg-primary/10" : "border-border"}`}>
            <div className="flex items-center justify-center gap-1 font-medium">
              <Bot className="h-3.5 w-3.5" /> AI Examiner
            </div>
            <Badge tone={aiStatus === "live" ? (aiSpeaking ? "primary" : "success") : "muted"}>
              {aiStatus === "live" ? (aiSpeaking ? "Speaking" : "Listening") : "Muted"}
            </Badge>
          </div>
        </div>

        {status === "lobby" && (
          <div className="mt-5">
            {isLead ? (
              <>
                <button
                  onClick={() => room.startViva()}
                  disabled={!canStart}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Start Viva
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {canStart
                    ? "Everyone's ready — start whenever you like."
                    : `Need 3-5 people in the lobby to start (${members.length} here now).`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for the team lead to start the viva…</p>
            )}
          </div>
        )}

        {status === "live" && (
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => room.toggleMic()}
              disabled={!isMyFloor}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
              title={isMyFloor ? "Mute/unmute yourself" : "You can only speak when the AI calls on you"}
            >
              {micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isMyFloor ? (micMuted ? "Unmute" : "Mute") : "Not your turn"}
            </button>
            {isLead && (
              <button
                onClick={() => room.endViva()}
                className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"
              >
                <PhoneOff className="h-4 w-4" /> End Viva
              </button>
            )}
          </div>
        )}
      </Card>

      <Card className="lg:col-span-4">
        <h3 className="text-base font-semibold">Live Q&amp;A</h3>
        <div className="mt-3 space-y-2">
          {events.map((e) => (
            <div key={e.id} className="rounded-lg border p-2 text-xs">
              <span className="font-semibold">{nameFor(e.speakerId)}</span>{" "}
              {e.kind === "question" ? (
                <span>was asked: {e.text}</span>
              ) : (
                <span>
                  scored {e.score}% {e.text ? `— ${e.text}` : ""}
                </span>
              )}
            </div>
          ))}
          {!events.length && <p className="text-xs text-muted-foreground">Questions will appear here once the AI starts calling on people.</p>}
        </div>
      </Card>
    </div>
  );
}
