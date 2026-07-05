import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, X, SkipForward, RotateCcw, Volume2, VolumeX, Lightbulb } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth-context";
import { useVivaSession, type ApiRecord } from "@/lib/hooks";
import { useSpeechToText, useTextToSpeech } from "@/lib/speech";
import { DeliveryPanel } from "@/components/delivery-panel";

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
  const queryClient = useQueryClient();
  const { data: session, isLoading, refetch } = useVivaSession(id);
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const bootstrapped = useRef(false);
  const endedRef = useRef(false);

  const language = String(session?.language ?? "English");
  const stt = useSpeechToText(language);
  const tts = useTextToSpeech(language);
  const voiceBaseRef = useRef("");

  // ----- Speak each new question aloud -----
  const speak = tts.speak;
  useEffect(() => {
    if (question?.question) speak(question.question);
  }, [question?.question_id, question?.question, speak]);

  // ----- Live dictation into the answer box -----
  useEffect(() => {
    if (!stt.listening) return;
    const spoken = `${voiceBaseRef.current} ${stt.transcript} ${stt.interim}`.trim();
    setAnswer(spoken);
  }, [stt.listening, stt.transcript, stt.interim]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  const endSession = useCallback(
    () =>
      run(async () => {
        if (endedRef.current) return;
        endedRef.current = true;
        tts.cancel();
        stt.stop();
        await api(`/api/viva/sessions/${id}/end`, { method: "POST" });
        queryClient.invalidateQueries({ queryKey: ["viva-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["viva-session", id] });
        queryClient.invalidateQueries({ queryKey: ["viva-stats"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        navigate({ to: "/ai-viva" });
      }),
    [id, navigate, queryClient, run, stt, tts],
  );

  // ----- Bootstrap: resume pending question or start a new one -----
  useEffect(() => {
    if (!session || bootstrapped.current) return;
    bootstrapped.current = true;
    setDifficulty(String(session.difficulty ?? "Medium"));
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
  }, [session, id, refetch, run]);

  // ----- Countdown timer with auto-end -----
  useEffect(() => {
    if (!session || session.status === "Completed") return;
    const total = Number(session.duration_minutes ?? 15) * 60;
    setRemaining((prev) => (prev == null ? total : prev));
  }, [session]);

  useEffect(() => {
    if (remaining == null || session?.status === "Completed") return;
    if (remaining <= 0) {
      void endSession();
      return;
    }
    const timer = setTimeout(() => setRemaining((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining, session?.status, endSession]);

  const resetInput = () => {
    setAnswer("");
    setHint(null);
    setFeedback(null);
    stt.reset();
    voiceBaseRef.current = "";
  };

  const submitAnswer = () =>
    run(async () => {
      if (!answer.trim()) return;
      stt.stop();
      const res = await api<{
        evaluation: { score: number; feedback?: string };
        next_question: LiveQuestion;
        difficulty?: string;
      }>(`/api/viva/sessions/${id}/answer`, { body: { answer } });
      setFeedback(`Score ${res.evaluation.score}/100${res.evaluation.feedback ? ` — ${res.evaluation.feedback}` : ""}`);
      setQuestion(res.next_question);
      if (res.difficulty) setDifficulty(res.difficulty);
      resetInput();
      void refetch();
    });

  const skipQuestion = () =>
    run(async () => {
      stt.stop();
      const res = await api<{ next_question: LiveQuestion }>(`/api/viva/sessions/${id}/skip`, { method: "POST" });
      setQuestion(res.next_question);
      resetInput();
      void refetch();
    });

  const getHint = () =>
    run(async () => {
      const res = await api<{ hint: string }>(`/api/viva/sessions/${id}/hint`, { method: "POST" });
      setHint(res.hint);
    });

  const toggleMic = () => {
    if (!stt.supported) return;
    if (stt.listening) {
      stt.stop();
    } else {
      voiceBaseRef.current = answer;
      stt.reset();
      stt.start();
    }
  };

  const questions = ((session?.questions as ApiRecord[] | undefined) ?? []).filter(
    (q) => q.answer_text != null && q.score != null,
  );
  const totalAsked = ((session?.questions as ApiRecord[] | undefined) ?? []).length;
  const answeredScores = questions.map((q) => Number(q.score ?? 0));
  const runningAvg = answeredScores.length
    ? Math.round(answeredScores.reduce((a, b) => a + b, 0) / answeredScores.length)
    : null;
  const title = String(session?.subject ?? `${String(session?.session_type ?? "Mock")} Viva`);
  const isCompleted = session?.status === "Completed";
  const timer =
    remaining == null
      ? "--:--"
      : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const lowTime = remaining != null && remaining <= 60 && !isCompleted;

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  // ----- Completed: transcript review -----
  if (isCompleted) {
    const allQuestions = (session?.questions as ApiRecord[] | undefined) ?? [];
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{title} — Review</div>
              <div className="text-xs text-muted-foreground">
                {allQuestions.length} questions · Final score {String(session?.score ?? "—")}%
              </div>
            </div>
            <button
              onClick={() => navigate({ to: "/ai-viva" })}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              Back to sessions
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
          <DeliveryPanel sessionId={id} />
          {allQuestions.length === 0 && (
            <p className="text-sm text-muted-foreground">No questions were recorded for this session.</p>
          )}
          {allQuestions.map((q, i) => {
            const score = q.score == null ? null : Number(q.score);
            return (
              <article key={String(q.id)} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span>Q{Number(q.question_number ?? i + 1)}</span>
                    {Boolean(q.topic) && <span className="rounded-full bg-secondary px-2 py-0.5">{String(q.topic)}</span>}
                  </div>
                  {score != null && (
                    <span className={`text-sm font-semibold ${score >= 60 ? "text-success" : "text-warning"}`}>
                      {score}/100
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-snug">{String(q.question_text)}</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Your answer: </span>
                    {q.answer_text ? String(q.answer_text) : <span className="italic text-muted-foreground">No answer</span>}
                  </p>
                  {Boolean(q.feedback) && (
                    <p className="rounded-xl bg-secondary p-3">
                      <span className="font-medium">Feedback: </span>
                      {String(q.feedback)}
                    </p>
                  )}
                  {Boolean(q.expected_answer) && (
                    <p className="rounded-xl border border-border p-3">
                      <span className="font-medium">Model answer: </span>
                      {String(q.expected_answer)}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
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
              aria-label="End session"
              className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">
                {difficulty}
                {String(session?.difficulty) === "Adaptive" ? " (adaptive)" : ""} difficulty · {language}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {tts.supported && (
              <button
                onClick={tts.toggleMute}
                aria-label={tts.muted ? "Unmute examiner voice" : "Mute examiner voice"}
                className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
              >
                {tts.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
            {runningAvg != null && (
              <div className="hidden text-right sm:block">
                <div className="text-xs text-muted-foreground">Avg score</div>
                <div className="text-sm font-semibold">{runningAvg}</div>
              </div>
            )}
            <div className="hidden text-right sm:block">
              <div className="text-xs text-muted-foreground">Question</div>
              <div className="text-sm font-semibold">
                {String(question?.question_number ?? totalAsked ?? 0).padStart(2, "0")}
              </div>
            </div>
            <div
              className={`rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums ${
                lowTime ? "bg-destructive text-destructive-foreground" : "bg-secondary"
              }`}
            >
              {timer}
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          <div className="flex justify-center">
            <div className="relative grid h-32 w-32 place-items-center rounded-full bg-primary text-primary-foreground">
              {(busy || tts.speaking) && <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />}
              <Volume2 className="h-10 w-10" />
            </div>
          </div>
          <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-card)]">
            <div className="flex justify-center gap-2">
              {question?.topic && (
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-accent-foreground">
                  {question.topic}
                </span>
              )}
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{difficulty}</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {question?.question ?? (busy ? "The examiner is thinking…" : "Preparing your first question…")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">Take your time. Speak or type your answer below.</p>
            {hint && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-left text-sm text-accent-foreground">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> {hint}
              </p>
            )}
            {feedback && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm">{feedback}</p>}
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          </div>
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={toggleMic}
                disabled={!stt.supported || busy}
                aria-label={stt.listening ? "Stop recording" : "Start recording"}
                className={`grid h-20 w-20 place-items-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-40 ${
                  stt.listening ? "bg-destructive" : "bg-primary"
                }`}
              >
                {stt.listening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
              </button>
              <div className="text-xs text-muted-foreground">
                {!stt.supported
                  ? "Voice input isn't supported in this browser — type below"
                  : stt.listening
                    ? "Listening… tap to stop"
                    : "Tap the mic to answer by voice, or type below"}
              </div>
              <textarea
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Speak or type your answer here..."
                className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <div className="flex gap-3">
                  <button
                    disabled={busy || !question}
                    onClick={() => void skipQuestion()}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    I don&apos;t know
                  </button>
                  <button
                    disabled={busy || !question}
                    onClick={() => void getHint()}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Lightbulb className="h-4 w-4" /> Hint
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={resetInput}
                    className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium"
                  >
                    <RotateCcw className="h-4 w-4" /> Clear
                  </button>
                  <button
                    disabled={busy || !answer.trim() || !question}
                    onClick={() => void submitAnswer()}
                    className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-40"
                  >
                    <SkipForward className="h-4 w-4" /> {busy ? "Scoring…" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
        <aside className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Question History</h3>
            <button
              onClick={() => void endSession()}
              className="rounded-lg bg-secondary px-3 py-1 text-xs font-medium hover:bg-secondary/70"
            >
              End &amp; report
            </button>
          </div>
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
