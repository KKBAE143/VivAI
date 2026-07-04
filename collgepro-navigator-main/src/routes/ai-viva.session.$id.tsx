import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, X, SkipForward, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth-context";
import { useVivaSession, type ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/ai-viva/session/$id")({
  head: () => ({ meta: [{ title: "Live Viva Session — CollgePro Navigator" }] }),
  component: VivaSession,
});

interface LiveQuestion {
  question_id?: string;
  question: string;
  question_number?: number;
  topic?: string | null;
}

function VivaSession() {
  useRequireAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, refetch } = useVivaSession(id);
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const bootstrapped = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session || bootstrapped.current) return;
    bootstrapped.current = true;
    if (session.status === "Completed") return;
    const questions = (session.questions as ApiRecord[] | undefined) ?? [];
    const pending = questions.filter((q) => q.answer_text == null);
    if (pending.length) {
      const q = pending[pending.length - 1];
      setQuestion({
        question_id: String(q.id),
        question: String(q.question_text),
        question_number: Number(q.question_number ?? questions.length),
        topic: q.topic ? String(q.topic) : null,
      });
    } else {
      void run(async () => {
        setQuestion(await api<LiveQuestion>(`/api/viva/sessions/${id}/start`, { method: "POST" }));
        void refetch();
      });
    }
  }, [session, id, refetch]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = () =>
    run(async () => {
      if (!answer.trim()) return;
      const res = await api<{
        evaluation: { score: number; feedback?: string };
        next_question: LiveQuestion;
      }>(`/api/viva/sessions/${id}/answer`, { body: { answer } });
      setFeedback(`Score ${res.evaluation.score}/100${res.evaluation.feedback ? ` — ${res.evaluation.feedback}` : ""}`);
      setQuestion(res.next_question);
      setAnswer("");
      void refetch();
    });

  const skipQuestion = () =>
    run(async () => {
      const res = await api<{ next_question: LiveQuestion }>(`/api/viva/sessions/${id}/skip`, { method: "POST" });
      setQuestion(res.next_question);
      setAnswer("");
      setFeedback(null);
      void refetch();
    });

  const endSession = () =>
    run(async () => {
      await api(`/api/viva/sessions/${id}/end`, { method: "POST" });
      navigate({ to: "/ai-viva" });
    });

  const questions = ((session?.questions as ApiRecord[] | undefined) ?? []).filter(
    (q) => q.answer_text != null && q.score != null,
  );
  const totalAsked = ((session?.questions as ApiRecord[] | undefined) ?? []).length;
  const title = String(session?.subject ?? `${String(session?.session_type ?? "Mock")} Viva`);
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void endSession()}
              aria-label="End"
              className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">
                {String(session?.difficulty ?? "Medium")} difficulty · {String(session?.language ?? "English")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-xs text-muted-foreground">Question</div>
              <div className="text-sm font-semibold">{String(question?.question_number ?? totalAsked ?? 0).padStart(2, "0")}</div>
            </div>
            <div className="rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold tabular-nums">{timer}</div>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          <div className="flex justify-center">
            <div className="relative grid h-32 w-32 place-items-center rounded-full bg-primary text-primary-foreground">
              {busy && <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />}
              <Volume2 className="h-10 w-10" />
            </div>
          </div>
          <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-card)]">
            <div className="flex justify-center gap-2">
              {question?.topic && (
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-accent-foreground">{question.topic}</span>
              )}
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{String(session?.difficulty ?? "Medium")}</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {session?.status === "Completed"
                ? "This session is complete — review your history on the right."
                : question?.question ?? (busy ? "The examiner is thinking…" : "Preparing your first question…")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">Take your time. Type your answer below.</p>
            {feedback && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm">{feedback}</p>}
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          </div>
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex flex-col items-center gap-4">
              <button className="grid h-20 w-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95">
                <Mic className="h-7 w-7" />
              </button>
              <div className="flex items-end gap-1">
                {[20, 40, 30, 60, 80, 50, 30, 70, 45, 25].map((h, i) => (
                  <div key={i} className="w-1.5 rounded-full bg-primary" style={{ height: `${h}%`, maxHeight: 40 }} />
                ))}
              </div>
              <div className="text-xs text-muted-foreground">Voice coming soon · type below</div>
              <textarea
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Or type your answer here..."
                className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <button
                  disabled={busy || !question}
                  onClick={() => void skipQuestion()}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  I don't know
                </button>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setAnswer("");
                      setFeedback(null);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium"
                  >
                    <RotateCcw className="h-4 w-4" /> Retry
                  </button>
                  <button
                    disabled={busy || !answer.trim() || !question}
                    onClick={() => void submitAnswer()}
                    className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
                  >
                    <SkipForward className="h-4 w-4" /> {busy ? "Scoring…" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
        <aside className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold">Question History</h3>
          <div className="mt-4 space-y-3">
            {questions.length === 0 && (
              <p className="text-xs text-muted-foreground">Answered questions will appear here.</p>
            )}
            {questions.map((h, i) => {
              const score = Number(h.score ?? 0);
              return (
                <div key={String(h.id)} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                    <span className="text-muted-foreground">Q{Number(h.question_number ?? i + 1)}</span>
                    <span className={score >= 60 ? "text-success" : "text-warning"}>
                      {score >= 60 ? "Good" : "Okay"} · {score}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs">{String(h.question_text)}</div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}