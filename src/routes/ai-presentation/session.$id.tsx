import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreatePresentation, usePresentationSession } from "@/lib/hooks";
import { LiveSessionRunner } from "@/components/live/live-session-runner";
import { SessionReport } from "@/components/reports/session-report";
import type { SessionReport as SessionReportData } from "@/lib/types";
import type { ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/ai-presentation/session/$id")({
  head: () => ({ meta: [{ title: "Live Presentation Session — VivAI" }] }),
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
  const navigate = useNavigate();
  const { data: session, isLoading, refetch } = usePresentationSession(id);
  const createFocused = useCreatePresentation();
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
  const material = session?.material as ApiRecord | null | undefined;
  const isCoach = Boolean(session?.material_id);
  const deckReport = ((report as unknown as ApiRecord | undefined)?.deck_report ??
    (state.report as unknown as ApiRecord | undefined)?.deck_report) as ApiRecord | undefined;

  const practiceWeakAreas = async () => {
    const focusUnits = Array.isArray(deckReport?.focus_unit_ids)
      ? deckReport.focus_unit_ids.map(String)
      : [];
    const next = await createFocused.mutateAsync({
      material_id: session?.material_id,
      project_id: projectId,
      training_mode: "practice",
      difficulty: session?.difficulty ?? "intermediate",
      scenario_id: session?.scenario_id ?? "project_defense",
      language,
      duration_minutes: session?.duration_minutes ?? 10,
      focus_unit_ids: focusUnits.length ? focusUnits : null,
      session_type: "Presentation Coach",
    });
    await navigate({ to: "/ai-presentation/session/$id", params: { id: String(next.id) } });
  };

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
                {isCoach
                  ? "Material-led practice report"
                  : `${slides.length} slides · ${answeredExam.length} questions`}
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
            <>
              <SessionReport report={report} />
              {isCoach && deckReport && (
                <DeckReport
                  state={deckReport}
                  onPractice={() => void practiceWeakAreas()}
                  pending={createFocused.isPending}
                />
              )}
            </>
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

              {!isCoach && answeredExam.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Examiner Q&amp;A</h3>
                  {answeredExam.map((q, i) => {
                    const score = q.score == null ? null : Number(q.score);
                    return (
                      <article
                        key={i}
                        className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]"
                      >
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
                          {q.answer || (
                            <span className="italic text-muted-foreground">No answer</span>
                          )}
                        </p>
                        {q.feedback && (
                          <p className="mt-2 rounded-xl bg-secondary p-3 text-sm">{q.feedback}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {!isCoach && slides.length > 0 && (
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
      mode={isCoach ? "presentation_coach" : "presentation"}
      sessionId={id}
      projectId={projectId}
      subject={subject}
      title={`${title} Presentation`}
      subtitle={
        isCoach
          ? "Work through your material with the coach."
          : "Share your screen and present — the examiner is watching live."
      }
      defaultLanguage={language}
      showPersona={!isCoach}
      configLocked={isCoach}
      sources={
        isCoach
          ? session?.training_mode === "practice"
            ? ["none", "camera"]
            : ["none"]
          : ["screen"]
      }
      presentationCoach={
        isCoach && material
          ? {
              material,
              units: (Array.isArray(session?.units)
                ? session.units
                : (material.units ?? [])) as ApiRecord[],
            }
          : undefined
      }
      onEnded={(summary) => {
        if (summary === null) {
          void navigate({ to: "/ai-presentation" });
          return;
        }
        setJustEnded(true);
        void refetch();
      }}
    />
  );
}

function DeckReport({
  state,
  onPractice,
  pending,
}: {
  state: ApiRecord;
  onPractice: () => void;
  pending: boolean;
}) {
  const scenarioDimensions =
    state.scenario_dimensions && typeof state.scenario_dimensions === "object"
      ? Object.entries(state.scenario_dimensions as ApiRecord).map(
          ([dimension, score]) => `${dimension.replaceAll("_", " ")}: ${String(score)}%`,
        )
      : [];
  const panels: [string, unknown][] = [
    ["Scenario dimensions", scenarioDimensions],
    ["Presenter weaknesses", state.presenter_weaknesses],
    ["Material weaknesses", state.material_weaknesses],
    ["Unsupported claims", state.unsupported_claims],
    ["Numerical justification gaps", state.numerical_justification_gaps],
    ["Unit readiness", state.unit_results],
    ["Concepts mastered", state.concepts_mastered],
    ["Concepts to revisit", state.concepts_needing_work],
    ["Likely evaluator concerns", state.evaluator_concerns],
    ["Candidate cross-unit inconsistencies", state.candidate_cross_slide_inconsistencies],
    ["Recommended deck corrections", state.recommended_corrections],
    ["Challenge questions", state.challenge_questions],
    ["Communication and delivery", state.communication_delivery_feedback],
    ["Suggested practice topics", state.suggested_practice_topics],
  ];
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Deck coaching</h2>
        <button
          onClick={onPractice}
          disabled={pending}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Creating…" : "Practice weak areas"}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {panels.map(([title, value]) => {
          const values = Array.isArray(value) ? value : value ? [value] : [];
          return values.length ? (
            <article key={title} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-sm font-semibold">{title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {values.map((item, i) => (
                  <li key={i} className="rounded-lg bg-secondary p-3">
                    {typeof item === "string"
                      ? item
                      : (item as ApiRecord).readiness != null
                        ? `${String((item as ApiRecord).title ?? "Unit")}: ${String((item as ApiRecord).readiness)}% (${String((item as ApiRecord).status ?? "not covered")})`
                        : String(
                            (item as ApiRecord).text ??
                              (item as ApiRecord).feedback ??
                              (item as ApiRecord).label ??
                              (item as ApiRecord).title ??
                              JSON.stringify(item),
                          )}
                  </li>
                ))}
              </ul>
            </article>
          ) : null;
        })}
      </div>
    </section>
  );
}
