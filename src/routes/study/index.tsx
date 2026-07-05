import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Layers, Plus, Trash2, Loader2, BrainCircuit, Sparkles, GraduationCap, ArrowRight } from "lucide-react";

import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/hooks";
import {
  useQuestionBanks,
  useCreateBank,
  useDeleteBank,
  useBankToViva,
  useFlashcardSummary,
} from "@/lib/hooks-features";

export const Route = createFileRoute("/study/")({
  head: () => ({ meta: [{ title: "Study Bank — VivAI" }] }),
  component: StudyPage,
});

function StudyPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const banks = useQuestionBanks();
  const summary = useFlashcardSummary();
  const [creating, setCreating] = useState(false);

  if (!authLoading && !ready) return null;

  return (
    <AppShell>
      <PageHeader
        title="Study Bank"
        subtitle="Turn your report or notes into exam-style question banks and spaced-repetition flashcards."
        action={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New Bank
          </button>
        }
      />

      <FlashcardCard summary={summary.data} />

      {creating && <CreateBankForm onClose={() => setCreating(false)} />}

      {banks.error ? (
        <ErrorState message="Could not load your study banks" onRetry={() => void banks.refetch()} />
      ) : banks.isLoading ? (
        <Card><p className="py-8 text-center text-sm text-muted-foreground">Loading banks…</p></Card>
      ) : (banks.data ?? []).length === 0 ? (
        <EmptyState
          title="No study banks yet"
          description="Generate your first bank from a project report, uploaded file, or pasted notes."
          action={
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> New Bank
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(banks.data ?? []).map((b) => <BankTile key={b.id} bank={b} />)}
        </div>
      )}
    </AppShell>
  );
}

function FlashcardCard({ summary }: { summary?: { total: number; due: number; learned: number } }) {
  const due = summary?.due ?? 0;
  return (
    <Card className="!bg-primary-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-accent-foreground">Flashcard Review</h3>
            <p className="text-sm text-accent-foreground/80">
              {summary
                ? `${due} due · ${summary.learned} learned · ${summary.total} total`
                : "Spaced repetition keeps answers fresh for viva day."}
            </p>
          </div>
        </div>
        <Link
          to="/study/review"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
        >
          {due > 0 ? `Review ${due} cards` : "Review flashcards"} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

function BankTile({ bank }: { bank: { id: string; title: string; question_count: number; card_count?: number } }) {
  const del = useDeleteBank();
  const toViva = useBankToViva();
  const navigate = useNavigate();
  const startViva = () =>
    toViva.mutate(
      { id: bank.id },
      {
        onSuccess: (session) => {
          const sid = String((session as { id?: unknown })?.id ?? "");
          navigate(sid ? { to: "/ai-viva/session/$id", params: { id: sid } } : { to: "/ai-viva" });
        },
      },
    );
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
          <Layers className="h-5 w-5 text-muted-foreground" />
        </span>
        <button
          onClick={() => { if (confirm("Delete this bank?")) del.mutate(bank.id); }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete bank"
        >
          {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold">{bank.title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="muted">{bank.question_count} questions</Badge>
        {bank.card_count != null && <Badge tone="primary">{bank.card_count} cards</Badge>}
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <Link
          to="/study/$id"
          params={{ id: bank.id }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-semibold hover:bg-secondary/70"
        >
          <Sparkles className="h-3.5 w-3.5" /> Open
        </Link>
        <button
          onClick={startViva}
          disabled={toViva.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {toViva.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />} To Viva
        </button>
      </div>
    </Card>
  );
}

function CreateBankForm({ onClose }: { onClose: () => void }) {
  const projects = useProjects();
  const create = useCreateBank();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [count, setCount] = useState(10);

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        project_id: projectId || null,
        source_text: sourceText.trim() || undefined,
        count,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Generate a study bank</h3>
        <button onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. DBMS Unit 3 — Normalization"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Link to project (optional)</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          >
            <option value="">No project — use pasted notes</option>
            {(projects.data ?? []).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>{String(p.title)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label className="text-xs font-semibold text-muted-foreground">Source notes (optional if a project is linked)</label>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={5}
          placeholder="Paste your report abstract, notes, or key concepts here…"
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          Questions:
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button
          onClick={submit}
          disabled={create.isPending || !title.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate
        </button>
      </div>
      {create.error && (
        <p className="mt-3 text-xs text-destructive">
          {create.error instanceof Error ? create.error.message : "Generation failed"}
        </p>
      )}
    </Card>
  );
}
