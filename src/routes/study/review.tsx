import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, RotateCw, Check, Loader2, PartyPopper } from "lucide-react";

import { AppShell, Card } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useDueFlashcards, useReviewFlashcard } from "@/lib/hooks-features";

export const Route = createFileRoute("/study/review")({
  head: () => ({ meta: [{ title: "Flashcard Review — VivAI" }] }),
  component: ReviewPage,
});

const QUALITY = [
  { q: 1, label: "Again", tone: "bg-destructive text-destructive-foreground" },
  { q: 3, label: "Hard", tone: "bg-warning text-background" },
  { q: 4, label: "Good", tone: "bg-primary text-primary-foreground" },
  { q: 5, label: "Easy", tone: "bg-success text-background" },
];

function ReviewPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const due = useDueFlashcards(30);
  const review = useReviewFlashcard();
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  if (!authLoading && !ready) return null;

  const cards = due.data ?? [];
  const card = cards[idx];

  const grade = (q: number) => {
    if (!card) return;
    review.mutate(
      { id: String(card.id), quality: q },
      {
        onSuccess: () => {
          setReviewed((r) => r + 1);
          setFlipped(false);
          setIdx((i) => i + 1);
        },
      },
    );
  };

  return (
    <AppShell>
      <Link to="/study" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Study Bank
      </Link>

      {due.error ? (
        <ErrorState message="Could not load your flashcards" onRetry={() => void due.refetch()} />
      ) : due.isLoading ? (
        <Card><p className="py-10 text-center text-sm text-muted-foreground">Loading cards…</p></Card>
      ) : cards.length === 0 || idx >= cards.length ? (
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-success/15 text-success">
            <PartyPopper className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-xl font-bold">All caught up!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {reviewed > 0 ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"} today. ` : ""}
              No more cards due right now.
            </p>
          </div>
          <Link to="/study" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
            Back to Study Bank
          </Link>
        </Card>
      ) : (
        <div className="mx-auto w-full max-w-2xl space-y-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Card {idx + 1} of {cards.length}</span>
            <span>{reviewed} reviewed</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(idx / cards.length) * 100}%` }} />
          </div>

          <button
            onClick={() => setFlipped((f) => !f)}
            className="flex min-h-[240px] w-full flex-col items-center justify-center gap-4 rounded-3xl bg-card p-8 text-center shadow-[var(--shadow-card)]"
          >
            {card.topic && <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-muted-foreground">{card.topic}</span>}
            <p className="text-lg font-semibold text-balance">{flipped ? card.back : card.front}</p>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <RotateCw className="h-3.5 w-3.5" /> {flipped ? "Show question" : "Show answer"}
            </span>
          </button>

          {flipped ? (
            <div className="grid grid-cols-4 gap-2">
              {QUALITY.map((g) => (
                <button
                  key={g.q}
                  onClick={() => grade(g.q)}
                  disabled={review.isPending}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold disabled:opacity-50 ${g.tone}`}
                >
                  {review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : g.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setFlipped(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              <Check className="h-4 w-4" /> Reveal answer
            </button>
          )}
        </div>
      )}
    </AppShell>
  );
}
