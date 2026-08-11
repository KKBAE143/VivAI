import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { useVivaSession, type ApiRecord } from "@/lib/hooks";
import { DeliveryPanel } from "@/components/delivery-panel";
import { LiveSessionRunner } from "@/components/live/live-session-runner";
import { SessionReport } from "@/components/reports/session-report";
import type { SessionReport as SessionReportData } from "@/lib/types";

export const Route = createFileRoute("/advanced/viva-code-aware_/session/$id")({
  head: () => ({ meta: [{ title: "Code-Aware Viva Session — VivAI" }] }),
  component: CodeAwareSessionPage,
});

/**
 * Same LiveStage layout as Mock Viva (controls | chat | scores).
 * Code awareness is entirely in the server knowledge pack / live brief —
 * no extra side rails of modules/graphs.
 */
function CodeAwareSessionPage() {
  useRequireAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, refetch } = useVivaSession(id);
  const [justEnded, setJustEnded] = useState(false);

  const title = String(session?.subject ?? "Code-Aware Viva");
  const language = String(session?.language ?? "English");
  const projectId = (session?.project_id as string | undefined) ?? null;
  const persona = String(session?.persona ?? "balanced");
  const isCompleted = session?.status === "Completed" || justEnded;

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading code viva…
      </div>
    );
  }

  if (isCompleted) {
    const allQuestions = (session?.questions as ApiRecord[] | undefined) ?? [];
    const report = session?.report as SessionReportData | null | undefined;
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
              type="button"
              onClick={() => navigate({ to: "/advanced/viva-code-aware" })}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              Back to Code-Aware Viva
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
          {report ? <SessionReport report={report} /> : <DeliveryPanel sessionId={id} />}
          {allQuestions.map((q, i) => (
            <article
              key={String(q.id)}
              className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]"
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Q{Number(q.question_number ?? i + 1)}
                {q.topic ? ` · ${String(q.topic)}` : ""}
              </div>
              <p className="mt-2 text-sm font-medium">{String(q.question_text)}</p>
              {q.answer_text != null && String(q.answer_text) !== "" && (
                <p className="mt-2 text-sm text-muted-foreground">{String(q.answer_text)}</p>
              )}
              {q.score != null && (
                <p className="mt-2 text-xs font-semibold text-primary">
                  Score {String(q.score)}/100
                </p>
              )}
              {q.feedback != null && String(q.feedback) !== "" && (
                <p className="mt-1 text-xs text-muted-foreground">{String(q.feedback)}</p>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  }

  return (
    <LiveSessionRunner
      mode="viva"
      sessionId={id}
      projectId={projectId}
      subject={title}
      title={title}
      subtitle="Code-aware mock viva — same layout as Mock Viva; examiner has your project brief."
      defaultLanguage={language}
      defaultPersona={persona}
      showPersona
      configLocked
      sources={["none"]}
      onEnded={() => {
        setJustEnded(true);
        void refetch();
      }}
    />
  );
}
