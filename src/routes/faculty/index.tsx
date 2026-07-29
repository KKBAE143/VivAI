import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  Radio,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/lib/auth-context";
import { useProfile, useTeams } from "@/lib/hooks";
import {
  useAssessedSession,
  useFacultyDashboard,
  useReviewAssessedSession,
  useScheduleAssessedViva,
  type FacultySession,
  type SessionStatus,
} from "@/lib/hooks-faculty";

export const Route = createFileRoute("/faculty/")({
  head: () => ({
    meta: [
      { title: "Faculty Console — VivAI" },
      {
        name: "description",
        content:
          "Schedule assessed team vivas, review AI-scored results, and sign off student marks.",
      },
    ],
  }),
  component: FacultyConsole,
});

const STATUS_TONE: Record<SessionStatus, "secondary" | "default" | "outline"> = {
  Pending: "outline",
  "In Progress": "default",
  Completed: "secondary",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One headline number. */
function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-6">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="mt-1.5 text-sm font-medium">{label}</div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const teams = useTeams();
  const schedule = useScheduleAssessedViva();
  const [teamId, setTeamId] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState("20");
  const [created, setCreated] = useState<{ join_code: string; team_name: string | null } | null>(
    null,
  );
  const [error, setError] = useState("");

  const submit = async () => {
    if (!teamId) {
      setError("Pick the team you're examining.");
      return;
    }
    setError("");
    try {
      const res = await schedule.mutateAsync({
        team_id: teamId,
        subject: subject.trim() || null,
        duration_minutes: Number(duration),
      });
      setCreated({ join_code: res.join_code, team_name: res.team_name });
      toast.success("Viva scheduled", { description: "Share the join code with the team." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not schedule the viva.";
      setError(message);
      toast.error("Could not schedule the viva", { description: message });
    }
  };

  const close = () => {
    onOpenChange(false);
    // Reset only after closing so the code stays visible while the dialog is up.
    setTimeout(() => {
      setCreated(null);
      setTeamId("");
      setSubject("");
      setError("");
    }, 200);
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.join_code);
      toast.success("Join code copied");
    } catch {
      toast.error("Couldn't copy", { description: "Select the code and copy it manually." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Viva scheduled</DialogTitle>
              <DialogDescription>
                Share this code with {created.team_name ?? "the team"}. They join from their own
                logins, so every mark is tied to the right student.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <code className="flex-1 font-mono text-lg font-semibold tracking-wider">
                {created.join_code}
              </code>
              <Button variant="secondary" size="sm" onClick={() => void copy()}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
            <Alert>
              <AlertDescription>
                You don't have to attend. The AI examiner runs the viva and the marks wait here for
                your sign-off.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Schedule an assessed viva</DialogTitle>
              <DialogDescription>
                The AI examines each student individually and attributes every question and score to
                them by name.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team">Team</Label>
                {teams.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading teams…</div>
                ) : (teams.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No teams yet. Students create a team from their dashboard first.
                  </p>
                ) : (
                  <Select value={teamId} onValueChange={setTeamId}>
                    <SelectTrigger id="team">
                      <SelectValue placeholder="Pick a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {(teams.data ?? []).map((t) => (
                        <SelectItem key={String(t.id)} value={String(t.id)}>
                          {String(t.name ?? "Untitled team")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject (optional)</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. DBMS"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["10", "15", "20", "30", "45"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={close} disabled={schedule.isPending}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={schedule.isPending}>
                {schedule.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {schedule.isPending ? "Scheduling…" : "Schedule viva"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  session,
  onClose,
}: {
  session: FacultySession | null;
  onClose: () => void;
}) {
  const detail = useAssessedSession(session?.id ?? null);
  const review = useReviewAssessedSession(session?.id ?? "");
  const [override, setOverride] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = override.trim();
    let score: number | null = null;
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        setError("An overridden mark has to be a whole number between 0 and 100.");
        return;
      }
      score = parsed;
    }
    setError("");
    try {
      await review.mutateAsync({ score_override: score, note: note.trim() || null });
      toast.success("Signed off", {
        description: score === null ? undefined : `Mark recorded as ${score}.`,
      });
      onClose();
      setOverride("");
      setNote("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save your sign-off.";
      setError(message);
      toast.error("Could not sign off", { description: message });
    }
  };

  return (
    <Dialog open={Boolean(session)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session?.team_name ?? "Team viva"}</DialogTitle>
          <DialogDescription>
            {session?.subject ? `${session.subject} — ` : ""}
            AI marks are advisory. Nothing is final until you sign off.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && <CardSkeleton className="h-40" />}
        {detail.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load this viva's questions. Close and try again.
            </AlertDescription>
          </Alert>
        )}

        {detail.data && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">AI overall score</span>
              <Badge variant="secondary">{detail.data.session.score ?? "—"}</Badge>
            </div>

            {detail.data.questions.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No questions were recorded for this viva. That usually means it ended before the
                  examiner asked anything — worth re-running rather than grading.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {detail.data.questions.map((q) => (
                  <div key={q.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">
                        {q.question ?? "(question not recorded)"}
                      </p>
                      {q.score !== null && <Badge variant="outline">{q.score}</Badge>}
                    </div>
                    {q.answer && <p className="mt-2 text-sm text-muted-foreground">{q.answer}</p>}
                    {q.feedback && (
                      <p className="mt-2 text-xs italic text-muted-foreground">{q.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="override">Override the overall mark (optional)</Label>
              <Input
                id="override"
                value={override}
                onChange={(e) => {
                  setOverride(e.target.value);
                  setError("");
                }}
                inputMode="numeric"
                placeholder="0–100"
              />
              <p className="text-xs text-muted-foreground">
                The AI's original score is kept alongside yours, so an override is always visible.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note for the record (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Strong on architecture, weak on normalisation."
                rows={3}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={review.isPending || session?.status !== "Completed"}
          >
            {review.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {review.isPending ? "Saving…" : "Sign off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FacultyConsole() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const role = (profile?.role as string) ?? "student";
  const isBlocked = !authLoading && ready && role !== "faculty" && role !== "admin";

  // Redirect in an effect, never above the hooks below. Returning early here
  // would change the hook call count between renders and crash the route — the
  // exact bug /admin already had and documents.
  useEffect(() => {
    if (isBlocked) navigate({ to: "/" });
  }, [isBlocked, navigate]);

  const dashboard = useFacultyDashboard();
  const [scheduling, setScheduling] = useState(false);
  const [reviewing, setReviewing] = useState<FacultySession | null>(null);

  if (dashboard.isLoading) {
    return (
      <AppShell>
        <PageHeader title="Faculty Console" subtitle="Loading your vivas…" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
        </div>
      </AppShell>
    );
  }

  if (dashboard.isError) {
    return (
      <AppShell>
        <ErrorState
          message={
            dashboard.error instanceof Error
              ? dashboard.error.message
              : "Could not load your faculty console."
          }
          onRetry={() => void dashboard.refetch()}
        />
      </AppShell>
    );
  }

  const summary = dashboard.data?.summary;
  const sessions = dashboard.data?.sessions ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Faculty Console"
        subtitle="Schedule assessed vivas, review AI marks, and sign them off."
        action={
          <Button onClick={() => setScheduling(true)}>
            <CalendarPlus className="h-4 w-4" /> Schedule viva
          </Button>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Scheduled" value={summary?.scheduled ?? 0} icon={CalendarPlus} />
        <StatCard label="Running now" value={summary?.in_progress ?? 0} icon={Radio} />
        <StatCard label="Completed" value={summary?.completed ?? 0} icon={CheckCircle2} />
        <StatCard
          label="Awaiting your sign-off"
          value={summary?.awaiting_review ?? 0}
          icon={ClipboardCheck}
          hint="Marks students are waiting on"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Assessed vivas</CardTitle>
          <CardDescription>
            Every viva your department has scheduled. Students' own practice sessions never appear
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No assessed vivas yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Schedule one and share the join code — you don't have to attend.
                </p>
              </div>
              <Button onClick={() => setScheduling(true)}>
                <CalendarPlus className="h-4 w-4" /> Schedule your first viva
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.team_name ?? "—"}</TableCell>
                      <TableCell>{s.subject ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_TONE[s.status] ?? "outline"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell>{s.score ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(s.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "Completed" ? (
                          s.reviewed_at ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-4 w-4" /> Signed off
                            </span>
                          ) : (
                            <Button size="sm" onClick={() => setReviewing(s)}>
                              Review
                            </Button>
                          )
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {s.join_code ?? "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ScheduleDialog open={scheduling} onOpenChange={setScheduling} />
      <ReviewDialog session={reviewing} onClose={() => setReviewing(null)} />
    </AppShell>
  );
}
