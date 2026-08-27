import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BrainCircuit,
  MonitorSmartphone,
  Users,
  Timer,
  Search,
  MoreVertical,
  ArrowLeftRight,
  Sparkles,
  ChevronDown,
  Info,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  FileText,
  Video,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { ErrorState } from "@/components/error-state";
import { useRequireAuth } from "@/lib/auth-context";
import { useReadiness } from "@/lib/hooks-features";
import { useDashboard, useProfile, useProjects, useTeams, useVivaSessions } from "@/lib/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — VivAI" },
      {
        name: "description",
        content:
          "Stay on top of your academic projects, prep for mock vivas, and track defense readiness in one unified workspace.",
      },
      { property: "og:title", content: "VivAI Dashboard" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const profileQuery = useProfile();
  const projectsQuery = useProjects();
  const sessionsQuery = useVivaSessions();
  const teamsQuery = useTeams();
  const dashboardQuery = useDashboard();
  const readinessQuery = useReadiness();

  const [searchQuery, setSearchQuery] = useState("");
  const [showMasked, setShowMasked] = useState(false);

  const queries = [profileQuery, projectsQuery, sessionsQuery, teamsQuery, dashboardQuery] as const;
  const loading = authLoading || queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.error);

  if (!authLoading && !ready) return null;

  const profile = profileQuery.data;
  const fullName = String(profile?.full_name ?? "Nikitin");
  const firstName = fullName.split(" ")[0] || "Student";
  const readiness = readinessQuery.data;
  const stats = dashboardQuery.data;
  const score = Math.round(readiness?.score ?? 84.5);
  const activeProjectsCount = stats?.active_projects ?? projectsQuery.data?.length ?? 3;

  return (
    <AppShell viewport>
      {loading ? (
        <DashboardSkeleton />
      ) : failed ? (
        <ErrorState
          message={
            failed.error instanceof Error ? failed.error.message : "Could not load your dashboard"
          }
          onRetry={() => {
            for (const q of queries) void q.refetch();
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between gap-3 overflow-hidden">
          {/* Top Header Bar */}
          <header className="flex h-11 shrink-0 items-center justify-between gap-3 sm:gap-4">
            {/* Left: User Greetings */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#719CEF] to-[#4568CB] text-white font-bold text-sm shadow-xs">
                <span>👨‍💻</span>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <h1 className="flex items-center gap-1 text-xs sm:text-sm font-bold tracking-tight text-foreground">
                  Greetings! <span className="inline-block animate-bounce">👋</span>
                </h1>
                <p className="truncate text-[11px] text-muted-foreground">
                  Start your day with{" "}
                  <span className="font-semibold text-foreground">{firstName}</span>
                </p>
              </div>
            </div>

            {/* Center: Search pill */}
            <div className="relative hidden w-full max-w-sm md:max-w-md sm:block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search projects, viva drills, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-white/40 dark:border-white/10 bg-card/75 dark:bg-card/45 py-1.5 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/70 backdrop-blur-xl shadow-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
              />
            </div>

            {/* Right: Profile Dropdown Pill */}
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-full border border-white/40 dark:border-white/10 bg-card/85 dark:bg-card/50 px-3.5 py-1.5 text-xs font-semibold text-foreground backdrop-blur-xl shadow-xs hover:bg-card transition-all"
              >
                <div className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] text-background font-bold">
                  {firstName[0]}
                </div>
                <span>My account</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Link>
            </div>
          </header>

          {/* Main Dashboard Content: 2-Column Grid */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 overflow-hidden">
            {/* Left 8 Columns (Cards + Actions + Recent Activity Table) */}
            <div className="flex flex-col justify-between gap-3 min-h-0 lg:col-span-8 overflow-hidden">
              {/* Section: Academic Cards */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    Cards
                  </h2>
                  <Link
                    to="/readiness"
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    See all
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Card 1: Dark Mesh Cyber Wallet Card (Defense Readiness) */}
                  <div className="relative flex h-[148px] flex-col justify-between rounded-3xl bg-gradient-to-br from-[#1C262B] via-[#111A1D] to-[#0A1012] p-4 text-white shadow-lg border border-white/15 overflow-hidden">
                    {/* Subtle dot matrix & globe grid mesh */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-[-20%] top-[-20%] h-48 w-48 opacity-25"
                    >
                      <svg
                        viewBox="0 0 100 100"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="0.5"
                      >
                        <circle cx="50" cy="50" r="40" strokeDasharray="2 2" />
                        <circle cx="50" cy="50" r="28" strokeDasharray="3 3" />
                        <ellipse cx="50" cy="50" rx="40" ry="18" />
                        <ellipse cx="50" cy="50" rx="18" ry="40" />
                      </svg>
                    </div>

                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-bold tracking-tight text-white">
                          ${score * 187}.0
                        </p>
                      </div>
                      <button className="text-white/60 hover:text-white transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-white/80">
                      <span className="tracking-widest font-mono">
                        {showMasked ? "4820 1810" : "**** 1810"}
                      </span>
                      <button
                        onClick={() => setShowMasked(!showMasked)}
                        className="text-white/50 hover:text-white transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span>10/24</span>
                      <span className="font-extrabold tracking-wider text-white text-[13px] italic">
                        VISA
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Frosted Light Glass Card (Academic Projects & XP) */}
                  <div className="relative flex h-[148px] flex-col justify-between rounded-3xl bg-card/90 dark:bg-card/50 backdrop-blur-2xl p-4 shadow-[var(--shadow-glass)] border border-white/50 dark:border-white/10 overflow-hidden">
                    {/* Subtle light mesh */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-[-10%] bottom-[-10%] h-36 w-36 opacity-15"
                    >
                      <svg
                        viewBox="0 0 100 100"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="0.75"
                      >
                        <circle cx="50" cy="50" r="35" strokeDasharray="4 4" />
                        <ellipse cx="50" cy="50" rx="35" ry="16" />
                      </svg>
                    </div>

                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-2xl font-bold tracking-tight text-foreground">
                          ₹ 123,424.0
                        </p>
                      </div>
                      <button className="text-muted-foreground hover:text-foreground transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="tracking-widest font-mono">
                        {showMasked ? "5129 1423" : "**** 1423"}
                      </span>
                      <button
                        onClick={() => setShowMasked(!showMasked)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>10/24</span>
                      <div className="flex items-center gap-1">
                        <span className="h-4 w-4 rounded-full bg-foreground" />
                        <span className="h-4 w-4 -ml-2 rounded-full bg-muted-foreground/60" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Quick Action Pills (Row of 4 Pills) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Link
                  to="/ai-viva/new"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-[#719CEF] hover:bg-[#5C8AE0] text-white px-3 py-2.5 text-xs font-semibold shadow-sm transition-all active:scale-95"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>Transfer</span>
                </Link>

                <Link
                  to="/ai-presentation"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 dark:bg-card/50 backdrop-blur-xl text-foreground hover:bg-card px-3 py-2.5 text-xs font-semibold shadow-xs transition-all active:scale-95"
                >
                  <FileText className="h-3.5 w-3.5 text-foreground" />
                  <span>Utility</span>
                </Link>

                <Link
                  to="/teams"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 dark:bg-card/50 backdrop-blur-xl text-foreground hover:bg-card px-3 py-2.5 text-xs font-semibold shadow-xs transition-all active:scale-95"
                >
                  <Users className="h-3.5 w-3.5 text-foreground" />
                  <span>Taxes</span>
                </Link>

                <Link
                  to="/pitch-drill"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 dark:bg-card/50 backdrop-blur-xl text-foreground hover:bg-card px-3 py-2.5 text-xs font-semibold shadow-xs transition-all active:scale-95"
                >
                  <Timer className="h-3.5 w-3.5 text-foreground" />
                  <span>Transport</span>
                </Link>
              </div>

              {/* Section: Recent Sales / Activity Table */}
              <div className="flex flex-1 flex-col justify-between rounded-3xl border border-white/40 dark:border-white/10 bg-card/75 dark:bg-card/45 backdrop-blur-2xl p-4 shadow-[var(--shadow-glass)] min-h-0 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-foreground">Recent Sales</h2>
                </div>

                <div className="w-full flex-1 flex flex-col justify-between min-h-0">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 text-[11px] font-medium text-muted-foreground pb-1.5 border-b border-border/50">
                    <div className="col-span-5">Sender</div>
                    <div className="col-span-3">Date</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2 text-right">Amount</div>
                  </div>

                  {/* Table Row 1: James Smith */}
                  <div className="grid grid-cols-12 items-center text-xs py-1.5">
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-secondary grid place-items-center text-xs font-bold shrink-0">
                        JS
                      </div>
                      <span className="font-semibold truncate text-foreground">James Smith</span>
                    </div>
                    <div className="col-span-3 text-[11px] text-muted-foreground">Mar 18, 2023</div>
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Success
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-semibold text-foreground">
                      -$1,980.0
                    </div>
                  </div>

                  {/* Table Row 2: George Holoster */}
                  <div className="grid grid-cols-12 items-center text-xs py-1.5">
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-secondary grid place-items-center text-xs font-bold shrink-0">
                        GH
                      </div>
                      <span className="font-semibold truncate text-foreground">
                        George Holoster
                      </span>
                    </div>
                    <div className="col-span-3 text-[11px] text-muted-foreground">Mar 10, 2023</div>
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary text-muted-foreground px-2 py-0.5 text-[10px] font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Process
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-semibold text-foreground">
                      -$880.0
                    </div>
                  </div>

                  {/* Table Row 3: Daniela Gordienko */}
                  <div className="grid grid-cols-12 items-center text-xs py-1.5">
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-secondary grid place-items-center text-xs font-bold shrink-0">
                        DG
                      </div>
                      <span className="font-semibold truncate text-foreground">
                        Daniela Gordienko
                      </span>
                    </div>
                    <div className="col-span-3 text-[11px] text-muted-foreground">Mar 21, 2023</div>
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 px-2 py-0.5 text-[10px] font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Failed
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-semibold text-foreground">
                      -$1,240.0
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 4 Columns: Statistic & Breakdown Panel */}
            <div className="flex h-full flex-col justify-between rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 dark:bg-card/50 backdrop-blur-2xl p-4 shadow-[var(--shadow-glass)] lg:col-span-4 overflow-hidden">
              {/* Statistic Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <span>Statistic</span>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                </div>
                <div className="flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-white/20 dark:border-white/10">
                  <span>This week</span>
                  <ChevronDown className="h-3 w-3" />
                </div>
              </div>

              {/* Donut Chart with Breakdown Ring */}
              <div className="relative my-1 flex items-center justify-center">
                <div className="relative h-28 w-28">
                  <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                    {/* Dark Slate Segment (35%) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#1E293B"
                      strokeWidth="12"
                      strokeDasharray="238.76"
                      strokeDashoffset="83.56"
                    />
                    {/* Primary Blue Segment (65%) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#719CEF"
                      strokeWidth="12"
                      strokeDasharray="238.76"
                      strokeDashoffset="155.2"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Center Content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase">
                      Total
                    </span>
                    <span className="text-sm font-extrabold text-foreground tracking-tight">
                      $14,810.0
                    </span>
                  </div>
                </div>

                {/* Floating Stat Chip next to the blue arc */}
                <div className="absolute right-3 top-2 rounded-full bg-foreground text-background px-2 py-0.5 text-[9px] font-bold shadow-xs">
                  $9,560.0
                </div>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#719CEF]" />
                  <span>Payment at the store</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#1E293B]" />
                  <span>Money transaction</span>
                </div>
              </div>

              {/* Breakdown List (5 Items) */}
              <div className="space-y-1.5 pt-1">
                {/* Spotify */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#719CEF] text-white">
                      <BrainCircuit className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[11px] leading-tight">
                        Spotify
                      </p>
                      <p className="text-[9px] text-muted-foreground">11 minuets ago</p>
                    </div>
                  </div>
                  <span className="font-bold text-foreground text-xs">-321$</span>
                </div>

                {/* Apple 1 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#719CEF] text-white">
                      <MonitorSmartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[11px] leading-tight">
                        Apple
                      </p>
                      <p className="text-[9px] text-muted-foreground">32 minuets ago</p>
                    </div>
                  </div>
                  <span className="font-bold text-foreground text-xs">-552$</span>
                </div>

                {/* Bitcoin */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#1E293B] text-white">
                      <span className="font-bold text-xs">₿</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[11px] leading-tight">
                        Bitcoin
                      </p>
                      <p className="text-[9px] text-muted-foreground">1 hour ago</p>
                    </div>
                  </div>
                  <span className="font-bold text-foreground text-xs">-123$</span>
                </div>

                {/* Apple 2 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#719CEF] text-white">
                      <MonitorSmartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[11px] leading-tight">
                        Apple
                      </p>
                      <p className="text-[9px] text-muted-foreground">3 hour 21 minuets ago</p>
                    </div>
                  </div>
                  <span className="font-bold text-foreground text-xs">-242$</span>
                </div>

                {/* Binance */}
                <div className="flex items-center justify-between text-xs py-1">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#1E293B] text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-[11px] leading-tight">
                        Binance
                      </p>
                      <p className="text-[9px] text-muted-foreground">1 day ago</p>
                    </div>
                  </div>
                  <span className="font-bold text-foreground text-xs">-160$</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
