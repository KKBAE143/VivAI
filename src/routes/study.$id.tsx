import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronDown, BrainCircuit, Loader2 } from "lucide-react";

import { AppShell, Card, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useQuestionBank, useBankToViva } from "@/lib/hooks-features";
import type { ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/study/$id")({
  head: () => ({ meta: [{ title: "Study Bank — VivAI" }] }),
  component: BankDetailPage,
});

function BankDetailPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const { id } = useParams({ from: "/study/$id" });
  const navigate = useNavigate();
  const bank = useQuestionBank(id);
  const toViva = useBankToViva();

  if (!authLoading && !ready) return null;

  const data = bank.data;
  const questions = (data?.questions as ApiRecord[] | undefined) ?? [];

  return (
    <AppShell>
      <Link to="/study" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Study Bank
      </Link>

      {bank.error ? (
        <ErrorState message="Could not load this bank" onRetry={() => void bank.refetch()} />
      ) : bank.isLoading ? (
        <Card><p className="py-10 text-center text-sm text-muted-foreground">Loading…</p></Card>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{String(data?.title ?? "Study Bank")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{questions.length} exam-style questions</p>
            </div>
            <button
              onClick={() =>
                toViva.mutate({ id }, { onSuccess: () => navigate({ to: "/ai-viva" }) })
              }
              disabled={toViva.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {toViva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Practice as Mock Viva
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((q, i) => <QuestionRow key={i} index={i} q={q} />)}
          </div>
        </>
      )}
    </AppShell>
  );
}

function QuestionRow({ index, q }: { index: number; q: ApiRecord }) {
  const [open, setOpen] = useState(false);
  const difficulty = String(q.difficulty ?? "Medium");
  return (
    <Card className="!p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold">{index + 1}</span>
        <span className="min-w-0 flex-1 text-sm font-medium">{String(q.question ?? q.text ?? "")}</span>
        <Badge tone={difficulty === "Hard" ? "destructive" : difficulty === "Easy" ? "success" : "warning"}>{difficulty}</Badge>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model answer</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {String(q.answer ?? q.model_answer ?? "No model answer available.")}
          </p>
          {q.topic ? <p className="mt-3 text-xs text-muted-foreground">Topic: {String(q.topic)}</p> : null}
        </div>
      )}
    </Card>
  );
}
