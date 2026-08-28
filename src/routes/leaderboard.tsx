import { createFileRoute } from "@tanstack/react-router";
import { Trophy, Flame, Star, Award } from "lucide-react";
import { useState } from "react";

import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useLeaderboard, useMe } from "@/lib/hooks";
import { useGamification } from "@/lib/hooks-features";
import type { ApiRecord } from "@/lib/hooks";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — VivAI" }] }),
  component: LeaderboardPage,
});

const PAGE_SIZE = 6;

function LeaderboardPage() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const board = useLeaderboard();
  const me = useMe();
  const game = useGamification();
  const [page, setPage] = useState(1);

  if (!authLoading && !ready) return null;

  const allRows = board.data ?? [];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = allRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Leaderboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Earn XP by practicing — vivas, presentations and pitches all count.
            </p>
          </div>
        </div>

        {game.data && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
            <StatTile icon={Star} label="Your XP" value={String(game.data.xp)} tint />
            <StatTile icon={Award} label="Level" value={String(game.data.level)} />
            <StatTile icon={Flame} label="Current Streak" value={`${game.data.current_streak}d`} />
            <StatTile
              icon={Trophy}
              label="Badges"
              value={`${game.data.badges_earned}/${game.data.badges_total}`}
            />
          </div>
        )}

        {board.error ? (
          <ErrorState
            message="Could not load the leaderboard"
            onRetry={() => void board.refetch()}
          />
        ) : (
          <Card className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Top Students</h3>
                {allRows.length > 0 && <Badge tone="muted">{allRows.length} ranked</Badge>}
              </div>
              <div className="mt-2.5 space-y-1">
                {allRows.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No ranked students yet — be the first to practice.
                  </p>
                )}
                {visibleRows.map((row: ApiRecord, i: number) => {
                  const isMe = row.id === me.data?.id;
                  const rank = (safePage - 1) * PAGE_SIZE + i + 1;
                  return (
                    <div
                      key={String(row.id)}
                      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 rounded-lg px-2.5 py-1.5 ${
                        isMe ? "bg-primary/10" : "hover:bg-secondary/60"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 sm:h-7 sm:w-7 place-items-center rounded-full text-xs font-bold ${rankTone(rank)}`}
                      >
                        {rank}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs sm:text-sm font-semibold">
                          {String(row.full_name ?? "Student")}{" "}
                          {isMe && <span className="text-primary">(You)</span>}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {[row.branch, row.year ? `${String(row.year)} Yr` : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {Number(row.current_streak ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-warning font-medium">
                            <Flame className="h-3 w-3" /> {String(row.current_streak)}
                          </span>
                        )}
                        <Badge tone={rank <= 3 ? "primary" : "muted"}>
                          {String(row.xp ?? 0)} XP
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {allRows.length > 0 && (
              <DataPagination
                page={safePage}
                totalPages={totalPages}
                totalItems={allRows.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="students"
                className="mt-2 pt-2"
              />
            )}
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function rankTone(rank: number): string {
  if (rank === 1) return "bg-warning/20 text-warning";
  if (rank === 2) return "bg-muted-foreground/20 text-foreground";
  if (rank === 3) return "bg-primary-soft text-accent-foreground";
  return "bg-secondary text-muted-foreground";
}

function StatTile({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Star;
  label: string;
  value: string;
  tint?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-3 sm:p-4 shadow-[var(--shadow-card)] ${tint ? "bg-primary-soft" : "bg-card"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tint ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
