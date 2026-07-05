import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { useVivaSession, type ApiRecord } from "@/lib/hooks";
import { DeliveryPanel } from "@/components/delivery-panel";
import { LiveSessionRunner } from "@/components/live/live-session-runner";

export const Route = createFileRoute("/ai-viva/session/$id")({
  head: () => ({ meta: [{ title: "Live Viva Session — CollgePro Navigator" }] }),
  component: VivaSession,
});

function VivaSession() {
  useRequireAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, refetch } = useVivaSession(id);
  const [justEnded, setJustEnded] = useState(false);

  const title = String(session?.subject ?? `${String(session?.session_type ?? "Mock")} Viva`);
  const language = String(session?.language ?? "English");
  const projectId = (session?.project_id as string | undefined) ?? null;
  const difficulty = String(session?.difficulty ?? "Medium");
  const isCompleted = session?.status === "Completed" || justEnded;

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
            <p className="text-sm text-muted-foreground">
              No questions were recorded for this session.
            </p>
          )}
          {allQuestions.map((q, i) => {
            const score = q.score == null ? null : Number(q.score);
            return (
              <article
                key={String(q.id)}
                className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span>Q{Number(q.question_number ?? i + 1)}</span>
                    {Boolean(q.topic) && (
                      <span className="rounded-full bg-secondary px-2 py-0.5">
                        {String(q.topic)}
                      </span>
                    )}
                  </div>
                  {score != null && (
                    <span
                      className={`text-sm font-semibold ${score >= 60 ? "text-success" : "text-warning"}`}
                    >
                      {score}/100
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-snug">
                  {String(q.question_text)}
                </h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Your answer: </span>
                    {q.answer_text ? (
                      String(q.answer_text)
                    ) : (
                      <span className="italic text-muted-foreground">No answer</span>
                    )}
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

  // ----- Live real-time viva -----
  return (
    <LiveSessionRunner
      mode="viva"
      sessionId={id}
      projectId={projectId}
      subject={session?.subject ? String(session.subject) : null}
      title={title}
      subtitle={`Difficulty: ${difficulty} · Speak naturally — the examiner is listening.`}
      defaultLanguage={language}
      showPersona
      sources={["camera", "none"]}
      onEnded={() => {
        setJustEnded(true);
        void refetch();
      }}
    />
  );
}
