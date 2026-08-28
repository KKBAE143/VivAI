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
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-graphik">
                Leaderboard
              </h1>
              <span className="text-[10px] sm:text-xs text-[#AFDDFF] bg-[#AFDDFF]/15 px-2 py-0.5 rounded font-mono">
                [ PEER_RANKINGS ]
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Earn XP by practicing — vivas, presentations and pitches all count.
            </p>
          </div>
        </div>

        {game.data && (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4 shrink-0">
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
          <div className="rounded-2xl border border-white/10 bg-card/85 p-4 sm:p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex-1 flex flex-col justify-between min-h-0">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="text-sm font-bold text-white font-graphik tracking-wide">
                  [ TOP_STUDENTS ]
                </h3>
                {allRows.length > 0 && (
                  <span className="text-[11px] font-mono text-white/60 bg-white/10 px-2 py-0.5 rounded">
                    {allRows.length} ranked
                  </span>
                )}
              </div>
              <div className="mt-2.5 space-y-1.5">
                {allRows.length === 0 && (
                  <p className="py-6 text-center text-xs text-white/40">
                    No ranked students yet — be the first to practice.
                  </p>
                )}
                {visibleRows.map((row: ApiRecord, i: number) => {
                  const isMe = row.id === me.data?.id;
                  const rank = (safePage - 1) * PAGE_SIZE + i + 1;
                  return (
                    <div
                      key={String(row.id)}
                      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-3 rounded-xl border border-white/5 px-3 py-2.5 transition-all ${
                        isMe
                          ? "bg-[#AFDDFF]/15 border-[#AFDDFF]/30 shadow-[0_0_12px_rgba(175,221,255,0.15)]"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg text-xs font-bold font-mono ${rankTone(rank)}`}
                      >
                        {rank}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs sm:text-sm font-bold text-white">
                          {String(row.full_name ?? "Student")}{" "}
                          {isMe && <span className="text-[#AFDDFF] font-mono text-xs">(You)</span>}
                        </div>
                        <div className="truncate text-[10px] text-white/50 font-mono">
                          {[row.branch, row.year ? `${String(row.year)} Yr` : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-2.5">
                        {Number(row.current_streak ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                            <Flame className="h-3.5 w-3.5 fill-amber-400/20" /> {String(row.current_streak)}
                          </span>
                        )}
                        <span
                          className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold ${
                            rank <= 3
                              ? "bg-[#AFDDFF] text-black shadow-xs"
                              : "bg-white/10 text-white/70"
                          }`}
                        >
                          {String(row.xp ?? 0)} XP
                        </span>
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
          </div>
        )}
      </div>
    </AppShell>
  );
}

function rankTone(rank: number): string {
  if (rank === 1) return "bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]";
  if (rank === 2) return "bg-white/80 text-black";
  if (rank === 3) return "bg-[#8DA6CC] text-black";
  return "bg-white/10 text-white/60";
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
      className={`rounded-2xl p-3.5 sm:p-4 border border-white/10 backdrop-blur-2xl transition-all ${
        tint
          ? "bg-[#AFDDFF]/10 border-[#AFDDFF]/30 shadow-[0_0_15px_rgba(175,221,255,0.15)]"
          : "bg-card/85 shadow-[var(--shadow-glass)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/60">{label}</span>
        <Icon className={`h-4 w-4 ${tint ? "text-[#AFDDFF]" : "text-white/40"}`} />
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-bold font-graphik text-white">{value}</div>
    </div>
  );
}
