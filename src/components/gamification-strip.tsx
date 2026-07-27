import { Flame, Star, Trophy } from "lucide-react";
import type { Gamification } from "@/lib/hooks-features";

/** Compact XP / streak / badges strip for the dashboard. */
export function GamificationStrip({ data }: { data?: Gamification }) {
  const xp = data?.xp ?? 0;
  const level = data?.level ?? 1;
  const into = data?.into_level ?? 0;
  const span = data?.level_span ?? 250;
  const pct = span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 0;
  const streak = data?.current_streak ?? 0;
  const badges = data?.badges_earned ?? 0;
  const badgesTotal = data?.badges_total ?? 0;

  const items = [
    {
      icon: Flame,
      value: `${streak}`,
      label: streak === 1 ? "day streak" : "day streak",
      tint: "text-warning",
      bg: "bg-warning/15",
    },
    {
      icon: Trophy,
      value: `${badges}/${badgesTotal}`,
      label: "badges",
      tint: "text-primary",
      bg: "bg-primary-soft",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      {/* Level + XP progress */}
      <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-accent-foreground">
              <Star className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">Level {level}</span>
          </div>
          <span className="text-xs text-muted-foreground">{xp} XP</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {span - into} XP to level {level + 1}
        </div>
      </div>

      {items.map((it) => {
        const I = it.icon;
        return (
          <div
            key={it.label}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)] sm:w-36"
          >
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${it.bg} ${it.tint}`}>
              <I className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xl font-bold leading-none">{it.value}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{it.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
