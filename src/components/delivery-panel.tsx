import { Gauge, MessageSquareWarning, Timer, Sparkles } from "lucide-react";

import { useVivaDelivery } from "@/lib/hooks-features";

/**
 * Delivery scorecard for a completed viva/presentation session.
 * Renders pace, fluency and clarity derived from the transcript + timing —
 * no audio pipeline needed. Silently hides when no transcript data exists.
 */
export function DeliveryPanel({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useVivaDelivery(sessionId);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm text-muted-foreground">Analyzing delivery…</p>
      </div>
    );
  }
  if (!data || !data.available) return null;

  const metrics = [
    { label: "Pace", value: data.pace_score, icon: Timer, hint: data.avg_wpm != null ? `${data.avg_wpm} wpm` : "—" },
    { label: "Fluency", value: data.fluency_score, icon: Gauge, hint: `${Math.round(data.filler_ratio * 100)}% fillers` },
    { label: "Clarity", value: data.clarity_score, icon: Sparkles, hint: `${data.words} words` },
  ].filter((m) => m.value != null) as { label: string; value: number; icon: typeof Gauge; hint: string }[];

  return (
    <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">Delivery Scorecard</h3>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {metrics.map((m) => {
          const Icon = m.icon;
          const tone = m.value >= 75 ? "text-success" : m.value >= 50 ? "text-warning" : "text-destructive";
          return (
            <div key={m.label} className="rounded-xl bg-secondary/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className={`mt-1 text-2xl font-bold ${tone}`}>{m.value}</div>
              <div className="text-[11px] text-muted-foreground">{m.hint}</div>
            </div>
          );
        })}
      </div>

      {data.top_fillers.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <MessageSquareWarning className="h-3.5 w-3.5" /> Most-used filler words
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.top_fillers.map((f) => (
              <span key={f.word} className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
                {f.word} · {f.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.tips.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {data.tips.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
