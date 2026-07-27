import { Award, Lock } from "lucide-react";

import { Card } from "@/components/app-shell";
import { useGamification } from "@/lib/hooks-features";

export function AchievementsCard() {
  const { data, isLoading } = useGamification();
  const badges = data?.badges ?? [];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Achievements</h3>
        </div>
        {data && (
          <span className="text-xs font-medium text-muted-foreground">
            {data.badges_earned} / {data.badges_total} unlocked
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Earn badges by practicing consistently and hitting milestones.
      </p>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`flex flex-col gap-1 rounded-xl border p-3 ${
                b.earned
                  ? "border-primary/40 bg-primary-soft"
                  : "border-border bg-secondary/40 opacity-70"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {b.earned ? (
                  <Award className="h-4 w-4 text-primary" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold">{b.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{b.desc}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
