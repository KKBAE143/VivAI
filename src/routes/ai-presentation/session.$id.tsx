import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { usePresentationSession } from "@/lib/hooks";
import { LiveSessionRunner } from "@/components/live/live-session-runner";
import { SessionReport } from "@/components/reports/session-report";
import type { SessionReport as SessionReportData } from "@/lib/types";

export const Route = createFileRoute("/ai-presentation/session/$id")({
  head: () => ({ meta: [{ title: "Live Presentation Session — CollegePro Navigator" }] }),
  component: PresentationSession,
});

interface SlideEntry {
  slide_number?: number;
  comments?: string;
  clarity_score?: number;
  score?: number;
  feedback?: string;
  topics?: Record<string, number>;
  [k: string]: unknown;
}

interface QaEntry {
  kind: "coach_chat" | "exam_q";
  question: string;
  answer?: string | null;
  topic?: string | null;
  expected_answer?: string | null;
  answered?: boolean;
  score?: number | null;
  feedback?: string | null;
}

function PresentationSession() {
  useRequireAuth();
  const { id } = Route.useParams();
  const { data: session, isLoading, refetch } = usePresentationSession(id);
  const [justEnded, setJustEnded] = useState(false);

  const title = String(session?.session_type ?? "Presentation");
  const language = String(session?.language ?? "English");
  const projectId = (session?.project_id as string | undefined) ?? null;

  const state =
    (session?.topic_scores as
      | {
          slides?: SlideEntry[];
          topics?: Record<string, number>;
          qa?: QaEntry[];
          subject?: string | null;
          report?: { gaps?: string[]; qa_feedback?: string | null };
        }
      | undefined) ?? {};
  const subject = state.subject ?? null;
  const slides: SlideEntry[] = state.slides ?? [];
  const qa: QaEntry[] = state.qa ?? [];
  const examQuestions = qa.filter((x) => x.kind === "exam_q");
  const answeredExam = examQuestions.filter((x) => x.answered);
  const report = session?.report as SessionReportData | null | undefined;

  const isCompleted = session?.status === "Completed" || justEnded;

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  // ---------- Completed: full report ----------
  if (isCompleted) {
    const persistedReport = state.report ?? {};
    const gaps = (session?.gaps as string[] | undefined) ?? persistedReport.gaps ?? [];
    const qaFeedback =
      (session?.qa_feedback as string | undefined) ?? persistedReport.qa_feedback ?? null;
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{title} Presentation — Report</div>
              <div className="text-xs text-muted-foreground">
                {slides.length} slides · {answeredExam.length} questions
              </div>
            </div>
            <Link
              to="/ai-presentation"
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              Back to sessions
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          {report ? (
            <SessionReport report={report} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Overall", session?.overall_score],
                  ["Clarity", session?.clarity_score],
                  ["Confidence", session?.confidence_score],
                  ["Coverage", session?.coverage_score],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="rounded-2xl bg-card p-4 text-center shadow-[var(--shadow-card)]"
                  >
                    <div className="text-2xl font-bold">{val == null ? "—" : `${val}%`}</div>
                    <div className="text-xs text-muted-foreground">{String(label)}</div>
                  </div>
                ))}
              </div>

              {session?.feedback_summary ? (
                <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                  <h3 className="text-sm font-semibold">Summary</h3>
                  <p className="mt-2 text-sm leading-relaxed">{String(session.feedback_summary)}</p>
                  {qaFeedback ? (
                    <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">{qaFeedback}</p>
                  ) : null}
                </div>
              ) : null}

              {gaps.length > 0 && (
                <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                  <h3 className="text-sm font-semibold">Areas to improve</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {gaps.map((g) => (
                      <span
                        key={g}
                        className="rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {answeredExam.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Examiner Q&amp;A</h3>
                  {answeredExam.map((q, i) => {
                    const score = q.score == null ? null : Number(q.score);
                    return (
                      <article key={i} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Q{i + 1}
                            {q.topic ? ` · ${q.topic}` : ""}
                          </span>
                          {score != null && (
                            <span
                              className={`text-sm font-semibold ${score >= 60 ? "text-success" : "text-warning"}`}
                            >
                              {score}/100
                            </span>
                          )}
                        </div>
                        <h4 className="mt-2 text-base font-semibold leading-snug">{q.question}</h4>
                        <p className="mt-2 text-sm">
                          <span className="text-muted-foreground">Your answer: </span>
                          {q.answer || <span className="italic text-muted-foreground">No answer</span>}
                        </p>
                        {q.feedback && (
                          <p className="mt-2 rounded-xl bg-secondary p-3 text-sm">{q.feedback}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {slides.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Slide feedback</h3>
                  {slides.map((sl, i) => {
                    const score = Number(sl.clarity_score ?? sl.score ?? 0);
                    const comments = String(sl.comments ?? sl.feedback ?? "");
                    return (
                      <div key={i} className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
                        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                          <span className="text-muted-foreground">
                            Slide {sl.slide_number ?? i + 1}
                          </span>
                          <span className={score >= 70 ? "text-success" : "text-warning"}>
                            {score > 0 ? score : "—"}
                          </span>
                        </div>
                        {comments && <p className="mt-1.5 text-sm">{comments}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- Live real-time session ----------
  return (
    <LiveSessionRunner
      mode="presentation"
      sessionId={id}
      projectId={projectId}
      subject={subject}
      title={`${title} Presentation`}
      subtitle="Share your screen and present — the examiner is watching live."
      defaultLanguage={language}
      showPersona
      sources={["screen"]}
      onEnded={() => {
        setJustEnded(true);
        void refetch();
      }}
    />
  );
}
