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
  Sparkles,
  Layers,
  Palette,
  Eye,
  Bell,
  GraduationCap,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { useReadiness } from "@/lib/hooks-features";
import { useRequireAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { useDashboard, useProfile, useProjects, useVivaSessions } from "@/lib/hooks";

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

function CircularProgress({ progress, size = 36 }: { progress: number; size?: number }) {
  const strokeWidth = 3;
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
          className="stroke-secondary/60"
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
      <span className="absolute text-[10px] font-bold text-foreground">{progress}%</span>
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
  const { theme, toggle } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const queries = [profileQuery, projectsQuery, sessionsQuery, dashboardQuery] as const;
  const loading = authLoading || queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.error);

  if (!authLoading && !ready) return null;

  const firstName = String(profileQuery.data?.full_name ?? "Taylor").split(" ")[0];
  const fullName = String(profileQuery.data?.full_name ?? "Student");
  const readinessScore = Math.round(readinessQuery.data?.score ?? 78);
  const projects = projectsQuery.data ?? [];
  const stats = dashboardQuery.data;

  // Filter projects if searched
  const activeProjects = projects
    .filter((p) => {
      if (!searchQuery) return true;
      return String(p.title ?? "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    })
    .slice(0, 2);

  return (
    <AppShell hideTopBar={true} fitViewport={true}>
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
        <div className="flex flex-col justify-between gap-2 xl:gap-2.5 max-w-[1550px] mx-auto w-full h-full min-h-0 overflow-hidden">
          {/* Top Header Bar matching ref */}
          <div className="flex shrink-0 items-center justify-between gap-3 pt-0.5">
            <div>
              <h1 className="text-lg sm:text-xl xl:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Welcome back {firstName}{" "}
                <span className="inline-block select-none text-lg sm:text-xl">👋</span>
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Search courses / projects */}
              <div className="relative w-44 sm:w-56 xl:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search courses & vivas"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-white/40 dark:border-white/10 bg-card/85 py-1.5 pl-8 pr-3.5 text-xs text-foreground placeholder:text-muted-foreground/70 backdrop-blur-xl focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs transition-all"
                />
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="grid h-7.5 w-7.5 place-items-center rounded-full border border-white/40 dark:border-white/10 bg-card/85 text-muted-foreground hover:text-foreground backdrop-blur-xl transition-colors shadow-2xs cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>

              {/* Notification icon */}
              <button
                aria-label="Notifications"
                className="relative grid h-7.5 w-7.5 place-items-center rounded-full border border-white/40 dark:border-white/10 bg-card/85 text-muted-foreground hover:text-foreground backdrop-blur-xl transition-colors shadow-2xs cursor-pointer"
              >
                <Bell className="h-3.5 w-3.5" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              </button>

              {/* Profile Avatar Pill */}
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-full border border-white/40 dark:border-white/10 bg-card/85 p-0.5 pr-2.5 backdrop-blur-xl shadow-2xs hover:border-primary transition-colors"
              >
                <div className="grid h-6.5 w-6.5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-xs font-semibold sm:inline text-foreground">
                  {firstName}
                </span>
              </Link>
            </div>
          </div>

          {/* Main Bento Grid Layout: Left Column (8 cols) + Right Sidebar Column (4 cols) */}
          <div className="flex-1 min-h-0 grid grid-cols-1 gap-2 xl:gap-2.5 lg:grid-cols-12 items-stretch overflow-hidden">
            {/* Left Section (8 cols) */}
            <div className="flex flex-col justify-between gap-2 xl:gap-2.5 lg:col-span-8 h-full min-h-0">
              {/* Row 1: Academic Focus Cards ("New Courses" in ref) */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <div className="flex items-center justify-between px-0.5">
                  <h2 className="text-[11px] xl:text-xs font-bold text-foreground tracking-tight">
                    New Courses & Focus
                  </h2>
                  <Link
                    to="/readiness"
                    className="text-[10px] xl:text-[11px] font-semibold text-muted-foreground hover:text-primary hover:underline"
                  >
                    View All
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 xl:gap-2.5">
                  {/* Card 1: Content / Defense Readiness */}
                  <Link
                    to="/readiness"
                    className="group flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50"
                  >
                    <div className="flex items-center gap-2 xl:gap-2.5">
                      <div className="grid h-8 w-8 xl:h-8.5 xl:w-8.5 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-500 dark:text-orange-400">
                        <Gauge className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">
                          Defense Readiness
                        </p>
                        <p className="text-[10px] text-muted-foreground">12 Milestones</p>
                      </div>
                    </div>
                    <div className="mt-2 xl:mt-2.5 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px]">
                      <span className="font-semibold text-primary">
                        ★ {readinessScore >= 75 ? "4.8" : "4.5"}
                      </span>
                      <span className="truncate text-muted-foreground">B.Tech Defense</span>
                    </div>
                  </Link>

                  {/* Card 2: Usability / AI Mock Viva */}
                  <Link
                    to="/ai-viva/new"
                    className="group flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50"
                  >
                    <div className="flex items-center gap-2 xl:gap-2.5">
                      <div className="grid h-8 w-8 xl:h-8.5 xl:w-8.5 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-500 dark:text-emerald-400">
                        <BrainCircuit className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">AI Mock Viva</p>
                        <p className="text-[10px] text-muted-foreground">
                          {stats?.viva_sessions ?? 15} Lessons
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 xl:mt-2.5 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px]">
                      <span className="font-semibold text-primary">★ 5.0</span>
                      <span className="truncate text-muted-foreground">Viva Examiner</span>
                    </div>
                  </Link>

                  {/* Card 3: Photography / Presentation */}
                  <Link
                    to="/ai-presentation"
                    className="group flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50"
                  >
                    <div className="flex items-center gap-2 xl:gap-2.5">
                      <div className="grid h-8 w-8 xl:h-8.5 xl:w-8.5 shrink-0 place-items-center rounded-xl bg-purple-500/15 text-purple-500 dark:text-purple-400">
                        <MonitorSmartphone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">
                          AI Presentation
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {stats?.presentation_sessions ?? 8} Lessons
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 xl:mt-2.5 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px]">
                      <span className="font-semibold text-primary">★ 4.6</span>
                      <span className="truncate text-muted-foreground">Slide & Pitch</span>
                    </div>
                  </Link>
                </div>
              </div>

              {/* Row 2: Middle Cards (Hours Activity + Daily Schedule) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 xl:gap-2.5 flex-1 min-h-0 items-stretch">
                {/* Hours Activity Card (7 cols) */}
                <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] sm:col-span-7 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground">Hours Activity</h3>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                        <ArrowUpRight className="h-3 w-3" />
                        <span>+3% Increase than last week</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-secondary/80 px-2 py-0.5 text-[9px] xl:text-[10px] font-semibold text-muted-foreground">
                      Weekly ⌵
                    </div>
                  </div>

                  {/* Chart with Y-Axis & Tooltip matching ref */}
                  <div className="relative mt-2 pt-3.5 flex-1 flex flex-col justify-end">
                    {/* Floating Tooltip above Wednesday bar */}
                    <div className="absolute left-[54%] top-0 -translate-x-1/2 -translate-y-0.5 rounded-md bg-foreground px-2 py-0.5 text-center shadow-md z-10">
                      <p className="text-[8.5px] font-bold text-background leading-none">
                        6h 45 min
                      </p>
                      <p className="text-[7px] text-background/70 leading-none mt-0.5">
                        5 Jan 2026
                      </p>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-3 border-transparent border-t-foreground" />
                    </div>

                    {/* Chart Body with Y-Axis Scale */}
                    <div className="flex gap-2 items-end h-22 xl:h-26 border-b border-border/40 pb-1">
                      <div className="flex flex-col justify-between h-full text-[7.5px] xl:text-[8px] text-muted-foreground/60 py-0.5">
                        <span>8h</span>
                        <span>6h</span>
                        <span>4h</span>
                        <span>2h</span>
                        <span>1h</span>
                      </div>
                      <div className="grid grid-cols-7 gap-2 xl:gap-3 w-full h-full items-end">
                        {[
                          { day: "Su", val: 50, active: false },
                          { day: "Mo", val: 75, active: false },
                          { day: "Tu", val: 30, active: false },
                          { day: "We", val: 95, active: true },
                          { day: "Th", val: 65, active: false },
                          { day: "Fr", val: 20, active: false },
                          { day: "Sa", val: 70, active: false },
                        ].map((b) => (
                          <div
                            key={b.day}
                            className="flex flex-col items-center gap-1 h-full justify-end"
                          >
                            <div
                              className={`w-full max-w-[8px] xl:max-w-[10px] rounded-full transition-all ${
                                b.active
                                  ? "bg-primary shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.5)]"
                                  : "bg-muted-foreground/35 hover:bg-muted-foreground/50"
                              }`}
                              style={{ height: `${b.val}%` }}
                            />
                            <span
                              className={`text-[8.5px] xl:text-[9px] ${
                                b.active ? "font-bold text-primary" : "text-muted-foreground"
                              }`}
                            >
                              {b.day}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily Schedule Card (5 cols) */}
                <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] sm:col-span-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-0.5">
                    <h3 className="text-xs font-bold text-foreground">Daily Schedule</h3>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {[
                      {
                        title: "Design System",
                        sub: "Lecture - Class",
                        icon: Layers,
                        color: "text-orange-500 bg-orange-500/15",
                        to: "/projects",
                      },
                      {
                        title: "Typography & UI",
                        sub: "Group - Test",
                        icon: BrainCircuit,
                        color: "text-purple-500 bg-purple-500/15",
                        to: "/ai-viva/new",
                      },
                      {
                        title: "Color Style & SRS",
                        sub: "Group - Test",
                        icon: Palette,
                        color: "text-emerald-500 bg-emerald-500/15",
                        to: "/projects",
                      },
                      {
                        title: "Visual Design Viva",
                        sub: "Lecture - Test",
                        icon: Eye,
                        color: "text-amber-500 bg-amber-500/15",
                        to: "/ai-presentation",
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.title}
                          to={item.to}
                          className="group flex items-center justify-between rounded-xl p-1 transition-colors hover:bg-secondary/60"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`grid h-6.5 w-6.5 xl:h-7 xl:w-7 shrink-0 place-items-center rounded-lg ${item.color}`}
                            >
                              <Icon className="h-3 w-3 xl:h-3.5 xl:w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[10.5px] xl:text-[11px] font-semibold text-foreground group-hover:text-primary transition-colors">
                                {item.title}
                              </p>
                              <p className="truncate text-[8.5px] xl:text-[9px] text-muted-foreground">
                                {item.sub}
                              </p>
                            </div>
                          </div>
                          <div className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full text-muted-foreground group-hover:text-foreground transition-colors">
                            <ChevronRight className="h-3 w-3" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 3: Projects You're Building ("Courses You're Taking" in ref) */}
              <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] flex flex-col justify-between shrink-0">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-xs font-bold text-foreground">Projects You're Building</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-lg bg-secondary/80 px-2 py-0.5 text-[9px] xl:text-[10px] font-semibold text-muted-foreground">
                      Active ⌵
                    </span>
                    <Link
                      to="/projects/new"
                      className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      <Plus className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  {[
                    {
                      id: "1",
                      title: activeProjects[0]?.title
                        ? String(activeProjects[0].title)
                        : "3D Design Course & Robot Project",
                      author: "Micheal Andrew",
                      time: "Remaining 8h 45 min",
                      progress: 45,
                      color: "text-purple-500 bg-purple-500/15",
                      initial: "3D",
                    },
                    {
                      id: "2",
                      title: activeProjects[1]?.title
                        ? String(activeProjects[1].title)
                        : "Development Basics & AI Assistant",
                      author: "Natalia Varnan",
                      time: "Remaining 18h 12 min",
                      progress: 75,
                      color: "text-rose-500 bg-rose-500/15",
                      initial: "Q",
                    },
                  ].map((proj) => (
                    <div
                      key={proj.id}
                      className="flex items-center justify-between rounded-xl bg-background/40 p-2 border border-border/30"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`grid h-7 w-7 xl:h-7.5 xl:w-7.5 shrink-0 place-items-center rounded-xl font-bold text-xs ${proj.color}`}
                        >
                          {proj.initial}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] xl:text-xs font-bold text-foreground">
                            {proj.title}
                          </p>
                          <div className="flex items-center gap-1 text-[9px] xl:text-[9.5px] text-muted-foreground mt-0.5">
                            <span className="grid h-3 w-3 place-items-center rounded-full bg-secondary text-[7px] font-bold">
                              👤
                            </span>
                            <span>{proj.author}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[8.5px] text-muted-foreground">Remaining</p>
                          <p className="text-[9.5px] font-semibold text-foreground">{proj.time}</p>
                        </div>
                        <CircularProgress progress={proj.progress} size={32} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar Section (4 cols) */}
            <div className="flex flex-col justify-between gap-2 xl:gap-2.5 lg:col-span-4 h-full min-h-0">
              {/* Top Banner: Go Premium / AI Viva Coach */}
              <div className="relative overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-[#122228] via-[#0A1619] to-[#060D0F] p-2.5 xl:p-3 text-white shadow-[var(--shadow-glass)] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-5.5 w-5.5 place-items-center rounded-lg bg-primary/20 text-primary">
                    <GraduationCap className="h-3 w-3" />
                  </span>
                  <span className="text-[11px] font-bold tracking-tight">VivAI</span>
                </div>
                <h4 className="mt-1.5 text-xs xl:text-sm font-bold text-white">
                  Go Premium & Live Coach
                </h4>
                <p className="mt-0.5 text-[9.5px] xl:text-[10px] text-white/70 leading-relaxed">
                  Explore 25k+ viva scenarios with real-time AI oral defense simulator.
                </p>
                <Link
                  to="/ai-viva/new"
                  className="mt-2 inline-flex items-center justify-center rounded-xl bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  Get Access
                </Link>
              </div>

              {/* Middle: Mini Calendar Widget matching ref */}
              <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] flex flex-col justify-between flex-1 min-h-0">
                <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] xl:text-xs font-bold text-foreground">
                    August, 2026
                  </span>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-[9px] xl:text-[9.5px]">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <span key={i} className="font-semibold text-muted-foreground/70 py-0.5">
                      {d}
                    </span>
                  ))}
                  {[
                    28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1,
                  ].map((day, idx) => {
                    const isHighlighted = idx === 19 || (day === 17 && idx >= 3 && idx <= 33);
                    const isMuted = idx < 3 || idx > 33;
                    return (
                      <div
                        key={idx}
                        className={`grid h-4.5 xl:h-5 w-full place-items-center rounded-full text-[8.5px] xl:text-[9px] ${
                          isHighlighted
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : isMuted
                              ? "text-muted-foreground/35"
                              : "text-foreground hover:bg-secondary/60"
                        }`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom: Assignments & Tasks matching ref */}
              <div className="rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-2.5 xl:p-3 backdrop-blur-xl shadow-[var(--shadow-glass)] flex flex-col justify-between shrink-0">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-xs font-bold text-foreground">Assignments</h3>
                  <Link
                    to="/projects"
                    className="grid h-4.5 w-4.5 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <Plus className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex flex-col gap-1.5">
                  {[
                    {
                      title: "Methods of data",
                      sub: "02 July, 10:30 AM",
                      status: "In progress",
                      icon: "✨",
                      badgeClass: "bg-purple-500/15 text-purple-500 dark:text-purple-400",
                    },
                    {
                      title: "Market Research",
                      sub: "14 June, 12:45 AM",
                      status: "Completed",
                      icon: "📑",
                      badgeClass: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
                    },
                    {
                      title: "Data Collection",
                      sub: "12 May, 11:00 AM",
                      status: "Upcoming",
                      icon: "📊",
                      badgeClass: "bg-orange-500/15 text-orange-500 dark:text-orange-400",
                    },
                  ].map((task) => (
                    <div
                      key={task.title}
                      className="flex items-center justify-between rounded-xl bg-background/40 p-1.5 xl:p-2 border border-border/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="grid h-5.5 w-5.5 shrink-0 place-items-center rounded-lg bg-secondary text-[10px]">
                          {task.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-foreground">
                            {task.title}
                          </p>
                          <p className="truncate text-[8.5px] text-muted-foreground">{task.sub}</p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[8.5px] xl:text-[9px] font-bold px-1.5 xl:px-2 py-0.5 rounded-full ${task.badgeClass}`}
                      >
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
