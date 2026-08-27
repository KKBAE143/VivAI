import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderKanban,
  BrainCircuit,
  MonitorSmartphone,
  Gauge,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
  Layers,
  Code2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { AppShell, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { useReadiness } from "@/lib/hooks-features";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useDashboard,
  useProfile,
  useProjects,
  useVivaSessions,
  type ApiRecord,
} from "@/lib/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — VivAI" },
      {
        name: "description",
        content:
          "Stay on top of your tasks, monitor progress, and track status across all your academic projects.",
      },
      { property: "og:title", content: "VivAI" },
      {
        property: "og:description",
        content: "The smarter way for B.Tech students to manage projects and prep for vivas.",
      },
    ],
  }),
  component: Dashboard,
});

function daysUntil(deadline: unknown): { label: string; days: number | null } {
  if (!deadline) return { label: "No deadline", days: null };
  const due = new Date(String(deadline));
  if (Number.isNaN(due.getTime())) return { label: "No deadline", days: null };
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Overdue (${Math.abs(days)}d)`, days };
  if (days === 0) return { label: "Due today", days };
  return { label: `Due in ${days}d`, days };
}

function CircularProgress({ progress, size = 44 }: { progress: number; size?: number }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg className="h-full w-full -rotate-90 transform" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-secondary/70"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-primary transition-all duration-500 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-foreground">{progress}%</span>
    </div>
  );
}

function Dashboard() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const profileQuery = useProfile();
  const projectsQuery = useProjects();
  const sessionsQuery = useVivaSessions();
  const dashboardQuery = useDashboard();
  const readinessQuery = useReadiness();
  const [searchQuery, setSearchQuery] = useState("");

  const queries = [profileQuery, projectsQuery, sessionsQuery, dashboardQuery] as const;
  const loading = authLoading || queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.error);

  if (!authLoading && !ready) return null;

  const firstName = String(profileQuery.data?.full_name ?? "Student").split(" ")[0];
  const readinessScore = Math.round(readinessQuery.data?.score ?? 0);
  const projects = projectsQuery.data ?? [];
  const stats = dashboardQuery.data;

  // Filter projects by search if provided
  const activeProjects = projects
    .filter((p) => {
      if (!searchQuery) return true;
      return String(p.title ?? "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    })
    .slice(0, 3);

  return (
    <AppShell>
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
        <div className="mx-auto flex flex-col gap-3.5">
          {/* Header Bar: Greeting + Search + Quick Profile */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Welcome back {firstName} <span className="inline-block select-none">👋</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Defense readiness, weekly viva practice, and active projects overview.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search projects & vivas…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-white/40 dark:border-white/10 bg-card/75 py-1.5 pl-9 pr-3.5 text-xs text-foreground placeholder:text-muted-foreground/70 backdrop-blur-xl focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs transition-all"
                />
              </div>

              <Link
                to="/profile"
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/40 dark:border-white/10 bg-card/75 p-1 pr-2.5 backdrop-blur-xl shadow-2xs transition-colors hover:border-primary"
              >
                <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-xs font-semibold sm:inline">{firstName}</span>
              </Link>
            </div>
          </div>

          {/* Main Bento Grid: 2 Columns on Desktop */}
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 items-start">
            {/* Left 8.5 Columns (Main Cards & Activity) */}
            <div className="flex flex-col gap-3.5 lg:col-span-8 xl:col-span-8">
              {/* Top 3 Quick Focus Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Card 1: Defense Readiness */}
                <Link
                  to="/readiness"
                  className="group relative flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-3.5 backdrop-blur-xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                      <Gauge className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        Defense Readiness
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {readinessScore}% DRS Score
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                    <span className="font-semibold text-primary">
                      ★ {readinessScore >= 75 ? "5.0" : "4.8"}
                    </span>
                    <span className="truncate text-muted-foreground">DRS Level</span>
                  </div>
                </Link>

                {/* Card 2: AI Mock Viva */}
                <Link
                  to="/ai-viva/new"
                  className="group relative flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-3.5 backdrop-blur-xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
                      <BrainCircuit className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">AI Mock Viva</p>
                      <p className="text-[11px] text-muted-foreground">
                        {stats?.viva_sessions ?? 0} Sessions Done
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                    <span className="font-semibold text-primary">
                      ★ {stats?.avg_viva_score ?? 85}%
                    </span>
                    <span className="truncate text-muted-foreground">Oral Exam</span>
                  </div>
                </Link>

                {/* Card 3: Presentation AI */}
                <Link
                  to="/ai-presentation"
                  className="group relative flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-3.5 backdrop-blur-xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <MonitorSmartphone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        AI Presentation
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {stats?.presentation_sessions ?? 0} Practices
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                    <span className="font-semibold text-primary">★ 4.9</span>
                    <span className="truncate text-muted-foreground">Slide Drill</span>
                  </div>
                </Link>
              </div>

              {/* Middle Row: Practice Activity Chart + Today's Schedule */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
                {/* Hours / Viva Activity Bar Chart */}
                <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-glass)] sm:col-span-7 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground">Practice Activity</h3>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-success">
                        <ArrowUpRight className="h-3 w-3" />
                        <span>+12% vs last week</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Weekly
                    </div>
                  </div>

                  {/* Clean SVG / HTML Bar Chart with Tooltip */}
                  <div className="relative mt-4 pt-4">
                    {/* Floating Tooltip matching ref */}
                    <div className="absolute left-[54%] top-0 -translate-x-1/2 -translate-y-1 rounded-lg bg-foreground px-2 py-1 text-center shadow-lg">
                      <p className="text-[10px] font-bold leading-none text-background">45 min</p>
                      <p className="text-[8px] text-background/80">Wed Practice</p>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                    </div>

                    {/* Chart Bars */}
                    <div className="grid grid-cols-7 items-end gap-2 h-28 border-b border-border/50 pb-2">
                      {[
                        { day: "Su", val: 35, highlight: false },
                        { day: "Mo", val: 65, highlight: false },
                        { day: "Tu", val: 40, highlight: false },
                        { day: "We", val: 92, highlight: true },
                        { day: "Th", val: 70, highlight: false },
                        { day: "Fr", val: 25, highlight: false },
                        { day: "Sa", val: 78, highlight: false },
                      ].map((item) => (
                        <div
                          key={item.day}
                          className="flex flex-col items-center gap-1.5 h-full justify-end"
                        >
                          <div
                            className={`w-full max-w-[14px] rounded-full transition-all duration-500 ${
                              item.highlight
                                ? "bg-primary shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.5)]"
                                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                            }`}
                            style={{ height: `${item.val}%` }}
                          />
                          <span
                            className={`text-[10px] font-medium ${
                              item.highlight ? "font-bold text-primary" : "text-muted-foreground"
                            }`}
                          >
                            {item.day}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Daily Schedule / Upcoming Lineup */}
                <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-glass)] sm:col-span-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground">Today's Lineup</h3>
                    <Link
                      to="/ai-viva"
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      View All
                    </Link>
                  </div>

                  <div className="mt-2.5 flex flex-col gap-2">
                    {[
                      {
                        title: "AI Viva Simulation",
                        sub: "Major Project · Oral Prep",
                        icon: BrainCircuit,
                        color: "text-primary bg-primary/15",
                        to: "/ai-viva/new",
                      },
                      {
                        title: "Architecture Review",
                        sub: "Diagram & SRS Milestones",
                        icon: Layers,
                        color: "text-accent-foreground bg-accent/20",
                        to: "/projects",
                      },
                      {
                        title: "Slide Deck Drill",
                        sub: "AI Presentation Pitch",
                        icon: MonitorSmartphone,
                        color: "text-primary bg-primary/10",
                        to: "/ai-presentation",
                      },
                      {
                        title: "Code-Aware Defense",
                        sub: "Live Code Deep Dive",
                        icon: Code2,
                        color: "text-foreground bg-secondary",
                        to: "/advanced/viva-code-aware",
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.title}
                          to={item.to}
                          className="group flex items-center justify-between rounded-xl p-1.5 transition-colors hover:bg-secondary/60"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${item.color}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                                {item.title}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {item.sub}
                              </p>
                            </div>
                          </div>
                          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Active Projects */}
              <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-foreground">Projects You're Building</h3>
                    <Badge tone="primary">{projects.length} Active</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link
                      to="/projects/new"
                      className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      to="/projects"
                      className="text-[10px] font-semibold text-primary hover:underline ml-1"
                    >
                      View All
                    </Link>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeProjects.length === 0 ? (
                    <div className="sm:col-span-2 rounded-xl border border-dashed border-border/70 p-4 text-center">
                      <p className="text-xs text-muted-foreground">No active projects found.</p>
                      <Link
                        to="/projects/new"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                      >
                        <Plus className="h-3.5 w-3.5" /> Create your first project
                      </Link>
                    </div>
                  ) : (
                    activeProjects.map((p) => {
                      const progress = Number(p.progress ?? 0);
                      const due = daysUntil(p.deadline);
                      const tag = String(p.type ?? "PBL").toUpperCase();
                      return (
                        <Link
                          key={String(p.id)}
                          to="/projects/$id"
                          params={{ id: String(p.id) }}
                          className="group flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3 transition-all hover:border-primary hover:bg-background/80"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary font-bold text-xs">
                              {tag.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                                {String(p.title)}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                <span>{String(p.subject ?? tag)}</span>
                                <span>•</span>
                                <span
                                  className={
                                    due.days !== null && due.days < 3
                                      ? "text-destructive font-semibold"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {due.label}
                                </span>
                              </div>
                            </div>
                          </div>
                          <CircularProgress progress={progress} size={38} />
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right 4 Columns (Sidebar Panel matching ref) */}
            <div className="flex flex-col gap-3.5 lg:col-span-4 xl:col-span-4">
              {/* Top Banner Card: AI Live Coach */}
              <div className="relative overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-[#0F1E24] via-[#091417] to-[#050C0E] p-4 text-white shadow-[var(--shadow-glass)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold tracking-wide">AI Viva Coach</span>
                  </div>
                  <Badge tone="primary">Real-time</Badge>
                </div>
                <h4 className="mt-2.5 text-sm font-bold leading-snug">Practice Live Mock Viva</h4>
                <p className="mt-1 text-[11px] text-white/70 leading-relaxed">
                  Interactive oral examiner with voice recognition & instant rubrics.
                </p>
                <Link
                  to="/ai-viva/new"
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <BrainCircuit className="h-3.5 w-3.5" /> Start Simulation
                </Link>
              </div>

              {/* Middle: Mini Calendar Widget */}
              <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-bold text-foreground">
                    {new Date().toLocaleString("en", { month: "long", year: "numeric" })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous month"
                      className="grid h-5 w-5 place-items-center rounded-md hover:bg-secondary text-muted-foreground"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next month"
                      className="grid h-5 w-5 place-items-center rounded-md hover:bg-secondary text-muted-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Calendar Grid */}
                <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px]">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <span key={i} className="font-semibold text-muted-foreground/70 py-0.5">
                      {d}
                    </span>
                  ))}
                  {/* Calendar sample days centered on current date */}
                  {[
                    28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1,
                  ].map((day, idx) => {
                    const todayDate = new Date().getDate();
                    const isToday = day === todayDate && idx >= 3 && idx <= 33;
                    const isMuted = idx < 3 || idx > 33;
                    return (
                      <div
                        key={idx}
                        className={`grid h-6 w-full place-items-center rounded-full text-[10px] ${
                          isToday
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : isMuted
                              ? "text-muted-foreground/40"
                              : "text-foreground hover:bg-secondary/60"
                        }`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom: Assignments / Tasks */}
              <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-glass)] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-foreground">Upcoming Tasks</h3>
                  <Link
                    to="/projects"
                    className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </Link>
                </div>

                <div className="mt-2.5 flex flex-col gap-2">
                  {[
                    {
                      title: "Literature Survey Report",
                      due: "Tomorrow, 11:00 AM",
                      status: "In progress",
                      tone: "primary",
                      icon: FolderKanban,
                    },
                    {
                      title: "Major Project Architecture",
                      due: "30 Aug, 2:00 PM",
                      status: "Upcoming",
                      tone: "warning",
                      icon: Layers,
                    },
                    {
                      title: "Phase 1 Viva Submission",
                      due: "Completed",
                      status: "Completed",
                      tone: "success",
                      icon: CheckCircle2,
                    },
                  ].map((task) => {
                    const Icon = task.icon;
                    return (
                      <div
                        key={task.title}
                        className="flex items-center justify-between rounded-xl bg-background/50 p-2 border border-border/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {task.title}
                            </p>
                            <p className="truncate text-[9px] text-muted-foreground">{task.due}</p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                            task.status === "In progress"
                              ? "bg-primary/15 text-primary"
                              : task.status === "Completed"
                                ? "bg-success/15 text-success"
                                : "bg-warning/15 text-warning"
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
