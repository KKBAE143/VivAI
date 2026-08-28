import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BrainCircuit,
  MonitorSmartphone,
  Video,
  Plus,
  ArrowRight,
  Sparkles,
  Search,
  FolderKanban,
  Flame,
  Star,
  Target,
  Clock,
  AlertCircle,
  Play,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { ReadinessGauge } from "@/components/readiness-gauge";
import { useRequireAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import {
  useDashboard,
  useProfile,
  useProjects,
  useVivaSessions,
  useVivaStats,
  useCreateVivaSession,
} from "@/lib/hooks";
import { useReadiness, useGamification } from "@/lib/hooks-features";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — VivAI" },
      {
        name: "description",
        content:
          "Your AI-powered academic defense and viva preparation hub. Monitor readiness, track project milestones, and drill weak topics.",
      },
      { property: "og:title", content: "VivAI Dashboard" },
      {
        property: "og:description",
        content: "Smart project defense cockpit and AI viva examiner for engineering students.",
      },
    ],
  }),
  component: Dashboard,
});

export default function Dashboard() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const profileQuery = useProfile();
  const projectsQuery = useProjects();
  const sessionsQuery = useVivaSessions();
  const statsQuery = useVivaStats();
  const dashboardQuery = useDashboard();
  const readinessQuery = useReadiness();
  const gamificationQuery = useGamification();
  const createSession = useCreateVivaSession();
  const navigate = useNavigate();
  const { toggle } = useTheme();

  const [searchQuery, setSearchQuery] = useState("");
  const [isStartingQuickViva, setIsStartingQuickViva] = useState<string | null>(null);

  // Weak Topics computed before any early return
  const readiness = readinessQuery.data;
  const vivaStats = statsQuery.data;

  const weakTopics = useMemo(() => {
    if (readiness?.weak_topics && readiness.weak_topics.length > 0) {
      return readiness.weak_topics.slice(0, 3);
    }
    if (vivaStats?.weaknesses && vivaStats.weaknesses.length > 0) {
      return vivaStats.weaknesses.slice(0, 3);
    }
    return [
      { topic: "Database Indexing & Normalization", avg_score: 55 },
      { topic: "API Security & Token Expiry", avg_score: 62 },
      { topic: "System Architecture Justification", avg_score: 58 },
    ];
  }, [readiness, vivaStats]);

  const queries = [
    profileQuery,
    projectsQuery,
    sessionsQuery,
    statsQuery,
    dashboardQuery,
    readinessQuery,
    gamificationQuery,
  ] as const;

  const loading = authLoading || queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.error);

  if (!authLoading && !ready) return null;

  // Profile data
  const profile = profileQuery.data;
  const fullName = String(profile?.full_name ?? "Student");
  const firstName = fullName.split(" ")[0] || "Student";

  // Readiness
  const readinessScore = Math.round(readiness?.score ?? 78);
  const readinessLabel =
    readiness?.label ??
    (readinessScore >= 80
      ? "Ready to Defend"
      : readinessScore >= 60
        ? "Almost Ready"
        : "Building Foundations");

  const components = readiness?.components ?? [
    { key: "technical", label: "Viva Performance", score: 82, weight: 0.35 },
    { key: "code", label: "Code Comprehension", score: 80, weight: 0.25 },
  ];

  // Gamification
  const gamification = gamificationQuery.data;
  const level = gamification?.level ?? 1;
  const xp = gamification?.xp ?? 150;
  const streak = gamification?.current_streak ?? 1;

  // Projects & Sessions
  const allProjects = projectsQuery.data ?? [];
  const allSessions = sessionsQuery.data ?? [];
  const dashStats = dashboardQuery.data;

  // Filtered projects
  const activeProjects = allProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(p.title ?? "")
        .toLowerCase()
        .includes(q) ||
      String(p.subject ?? "")
        .toLowerCase()
        .includes(q)
    );
  });

  // Filtered sessions
  const recentSessions = allSessions.slice(0, 3);

  // Quick Viva Launch Handler
  const handleQuickDrill = async (topic?: string, projectId?: string) => {
    const key = topic || projectId || "general";
    setIsStartingQuickViva(key);
    try {
      const res = await createSession.mutateAsync({
        session_type: projectId ? "Project" : topic ? "Subject" : "General",
        project_id: projectId || undefined,
        subject: topic || undefined,
        duration_minutes: 5,
        difficulty: "Adaptive",
        persona: "balanced",
        language: "English",
      });
      navigate({ to: "/ai-viva/session/$id", params: { id: String(res.id) } });
    } catch {
      navigate({ to: "/ai-viva/new" });
    } finally {
      setIsStartingQuickViva(null);
    }
  };

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
        <div className="flex h-full max-h-full min-h-0 w-full max-w-[1550px] mx-auto flex-col justify-between gap-3 lg:gap-3.5 overflow-hidden">
          {/* Top Bar / Integrated Header (Compact) */}
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 px-4 py-2.5 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-primary to-amber-400 text-sm font-black text-primary-foreground shadow-xs">
                {firstName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-sm font-bold text-foreground sm:text-base">
                    Welcome back, {firstName}
                  </h1>
                  <span className="inline-block select-none text-sm">👋</span>
                </div>
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                  {readinessScore >= 75
                    ? "Ready for defense · Keep sharpening technical delivery"
                    : "Focus on identified weak topics today to boost readiness"}
                </p>
              </div>
            </div>

            {/* Quick Status Pills & Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Gamification Pills */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2.5 py-1 text-[11px] font-bold text-foreground backdrop-blur-sm">
                  <Flame className="h-3.5 w-3.5 text-orange-500 fill-orange-500/20" />
                  <span>{streak}d streak</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2.5 py-1 text-[11px] font-bold text-foreground backdrop-blur-sm">
                  <Star className="h-3.5 w-3.5 text-primary fill-primary/20" />
                  <span>
                    Lvl {level} · {xp} XP
                  </span>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-36 sm:w-48">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-border/60 bg-background/80 py-1 pl-7 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 backdrop-blur-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs transition-all"
                />
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="grid h-8 w-8 place-items-center rounded-full border border-border/60 bg-background/80 text-muted-foreground hover:text-foreground backdrop-blur-md transition-colors shadow-2xs cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>

              {/* New Project CTA */}
              <Link
                to="/projects/new"
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Project</span>
              </Link>
            </div>
          </div>

          {/* Row 1: Split Hero (Readiness Station on left + AI Action Launchpad on right) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 shrink-0 lg:flex-1 lg:min-h-0 items-stretch">
            {/* Defense Readiness Station (5 cols) */}
            <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-card/90 via-card/75 to-secondary/30 p-3.5 xl:p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)] lg:col-span-5 min-h-0">
              <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Target className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-xs xl:text-sm font-bold text-foreground">
                    Defense Readiness
                  </h2>
                </div>
                <Link
                  to="/readiness"
                  className="text-[10.5px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                >
                  <span>Full Report</span>
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Gauge + Status + Mini Breakdown */}
              <div className="grid grid-cols-[auto_1fr] items-center gap-4 my-auto py-1">
                <div className="relative shrink-0">
                  <ReadinessGauge score={readinessScore} size={88} strokeWidth={8} />
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <div>
                    <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary dark:text-amber-300">
                      {readinessLabel}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                      {readiness?.actions?.[0]?.text ??
                        "Cross-questioning practice recommended on your core project modules."}
                    </p>
                  </div>

                  {/* 2 Mini Progress Bars */}
                  <div className="flex flex-col gap-1.5">
                    {components.slice(0, 2).map((c) => {
                      const score = Math.round(c.score);
                      return (
                        <div key={c.key}>
                          <div className="flex items-center justify-between text-[10px] font-semibold text-foreground">
                            <span>{c.label}</span>
                            <span className="text-primary">{score}%</span>
                          </div>
                          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Instant CTA Button */}
              <button
                onClick={() => handleQuickDrill()}
                disabled={isStartingQuickViva !== null}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>
                  {isStartingQuickViva ? "Launching Viva..." : "Launch Defense Simulation"}
                </span>
              </button>
            </div>

            {/* AI Action Launchpad (7 cols, 3 cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:col-span-7 min-h-0 items-stretch">
              {/* Card 1: AI Mock Viva */}
              <Link
                to="/ai-viva/new"
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-glass-hover)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary group-hover:scale-105 transition-transform">
                      <BrainCircuit className="h-4.5 w-4.5" />
                    </div>
                    <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {vivaStats?.total_sessions ?? dashStats?.viva_sessions ?? 0} Vivas
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-xs xl:text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    AI Mock Viva
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    Practice oral defense with Strict, Balanced, or Friendly AI professors.
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-primary">
                  <span>Start Mock Session</span>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 2: Slide & Presentation */}
              <Link
                to="/ai-presentation"
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-purple-500/50 hover:shadow-[var(--shadow-glass-hover)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-500/15 text-purple-500 group-hover:scale-105 transition-transform">
                      <MonitorSmartphone className="h-4.5 w-4.5" />
                    </div>
                    <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {dashStats?.presentation_sessions ?? 0} Pitches
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-xs xl:text-sm font-bold text-foreground group-hover:text-purple-500 transition-colors">
                    Presentation Mock
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    Upload slides, practice project demos, and get anticipated questions.
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-purple-500 dark:text-purple-400">
                  <span>Open Presentation Hub</span>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Card 3: Live Voice Coach */}
              <Link
                to="/advanced/sentiment-analysis"
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-[var(--shadow-glass-hover)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-500 group-hover:scale-105 transition-transform">
                      <Video className="h-4.5 w-4.5" />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Live Voice
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-xs xl:text-sm font-bold text-foreground group-hover:text-emerald-500 transition-colors">
                    Live Defense Coach
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    Real-time speech analytics, pace (WPM), clarity, and filler ratio.
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-500 dark:text-emerald-400">
                  <span>Enter Live Coach</span>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>

          {/* Row 2: 3-Column Core Workstation (Projects, Recent Vivas, Weakness Radar) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 shrink-0 lg:flex-1 lg:min-h-0 items-stretch">
            {/* Col 1: Active Projects (4 cols) */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-3.5 xl:p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)] lg:col-span-4 min-h-0">
              <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/15 text-primary">
                    <FolderKanban className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs xl:text-sm font-bold text-foreground">Active Projects</h3>
                </div>
                <Link
                  to="/projects"
                  className="text-[10.5px] font-semibold text-muted-foreground hover:text-primary transition-colors"
                >
                  View All ({allProjects.length})
                </Link>
              </div>

              <div className="flex flex-col gap-2 my-auto py-1 min-h-0 overflow-y-auto">
                {activeProjects.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-semibold text-foreground">No projects yet</p>
                    <Link
                      to="/projects/new"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary"
                    >
                      <Plus className="h-3 w-3" /> Create Project
                    </Link>
                  </div>
                ) : (
                  activeProjects.slice(0, 2).map((project) => {
                    const id = String(project.id);
                    const title = String(project.title ?? "Untitled Project");
                    const progress = Number(project.progress ?? 35);
                    const projectType = String(project.project_type ?? "Major");

                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-border/30 bg-background/50 p-2.5 transition-all hover:bg-background/80"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 font-bold text-xs text-primary">
                            {title.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link
                                to="/projects/$id"
                                params={{ id }}
                                className="truncate text-xs font-bold text-foreground hover:text-primary transition-colors"
                              >
                                {title}
                              </Link>
                              <span className="rounded bg-secondary/80 px-1 py-0.2 text-[9px] font-medium text-muted-foreground">
                                {projectType}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                              <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span>{progress}%</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleQuickDrill(undefined, id)}
                          disabled={isStartingQuickViva === id}
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                        >
                          <BrainCircuit className="h-3 w-3" />
                          <span>Defend</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Col 2: Recent Viva Defense Sessions (4 cols) */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-3.5 xl:p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)] lg:col-span-4 min-h-0">
              <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs xl:text-sm font-bold text-foreground">Recent Sessions</h3>
                </div>
                <Link
                  to="/ai-viva"
                  className="text-[10.5px] font-semibold text-muted-foreground hover:text-primary transition-colors"
                >
                  History
                </Link>
              </div>

              <div className="flex flex-col gap-2 my-auto py-1 min-h-0 overflow-y-auto">
                {recentSessions.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-semibold text-foreground">No sessions completed</p>
                    <Link
                      to="/ai-viva/new"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary"
                    >
                      <Play className="h-3 w-3 fill-current" /> Start First Viva
                    </Link>
                  </div>
                ) : (
                  recentSessions.slice(0, 2).map((session) => {
                    const id = String(session.id);
                    const subject = String(session.subject ?? "Technical Viva");
                    const score = session.score != null ? Math.round(Number(session.score)) : null;
                    const persona = String(session.persona ?? "Balanced");

                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-border/30 bg-background/50 p-2.5 transition-all hover:bg-background/80"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500 font-bold">
                            <BrainCircuit className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-foreground">{subject}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Examiner: {persona}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {score != null ? (
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                                score >= 75
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-primary/15 text-primary dark:text-amber-400"
                              }`}
                            >
                              {score}%
                            </span>
                          ) : null}
                          <Link
                            to="/ai-viva/session/$id"
                            params={{ id }}
                            className="rounded-lg bg-secondary px-2 py-1 text-[10.5px] font-semibold text-foreground hover:bg-secondary/90 transition-colors"
                          >
                            Review
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Col 3: Weakness Radar & Instant Drills (4 cols) */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-3.5 xl:p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)] lg:col-span-4 min-h-0">
              <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-rose-500/15 text-rose-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs xl:text-sm font-bold text-foreground">Weakness Radar</h3>
                </div>
                <Link
                  to="/weakness-heatmap"
                  className="text-[10.5px] font-semibold text-muted-foreground hover:text-primary transition-colors"
                >
                  Heatmap
                </Link>
              </div>

              <div className="flex flex-col gap-2 my-auto py-1 min-h-0 overflow-y-auto">
                {weakTopics.slice(0, 2).map((item, idx) => {
                  const topicName = typeof item === "string" ? item : item.topic;
                  const avgScore =
                    typeof item === "object" && item.avg_score ? Math.round(item.avg_score) : 55;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2.5 rounded-xl border border-border/30 bg-background/50 p-2.5 transition-all hover:bg-background/80"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">{topicName}</p>
                        <p className="text-[10px] font-semibold text-rose-500 dark:text-rose-400 mt-0.5">
                          Avg: {avgScore}% · High Priority
                        </p>
                      </div>
                      <button
                        onClick={() => handleQuickDrill(topicName)}
                        disabled={isStartingQuickViva === topicName}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary dark:text-amber-400 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        <span>{isStartingQuickViva === topicName ? "..." : "Drill"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
