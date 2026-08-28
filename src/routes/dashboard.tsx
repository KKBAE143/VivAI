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
import { AppShell, ThemeToggle } from "@/components/app-shell";
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

export const Route = createFileRoute("/dashboard")({
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
        <div className="flex h-full lg:max-h-full min-h-0 w-full max-w-[1600px] mx-auto flex-col justify-between gap-3 lg:gap-3.5 lg:overflow-hidden overflow-y-auto font-manrope">
          {/* Header Bar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 apple-glass-card rounded-[24px] px-4 sm:px-5 py-2.5 sm:py-3 shadow-sm">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-10 h-10 rounded-full bg-primary/10 border-2 border-border flex items-center justify-center text-primary font-bold text-base shadow-xs shrink-0">
                {firstName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="truncate font-graphik text-sm sm:text-base font-bold text-foreground tracking-wide">
                    Welcome back, {firstName}
                  </h1>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Online</span>
                  </div>
                </div>
                <p className="hidden truncate text-xs text-muted-foreground sm:block mt-0.5">
                  {readinessScore >= 75
                    ? "Ready for oral defense · Keep drilling technical depth"
                    : "Target identified weak topics today to advance readiness score"}
                </p>
              </div>
            </div>

            {/* Header Right Widgets */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              {/* Gamification Capsule */}
              <div className="hidden md:flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-border px-3.5 py-1.5 rounded-2xl backdrop-blur-md">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Flame className="h-4 w-4 text-orange-400 fill-orange-400/20" />
                  <span>{streak}d streak</span>
                </div>
                <div className="w-px h-4 bg-border"></div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>
                    Lvl {level} · {xp} XP
                  </span>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-32 xs:w-40 sm:w-48">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-black/5 dark:bg-white/5 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground backdrop-blur-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              {/* Theme Switcher Toggle */}
              <ThemeToggle />

              {/* New Project CTA */}
              <Link
                to="/projects/new"
                className="apple-glass-btn-primary px-4 py-1.5 text-xs font-bold sm:inline-flex items-center gap-1.5 no-underline rounded-2xl shadow-md cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Project</span>
              </Link>
            </div>
          </div>

          {/* Row 1: 5-Column Hero Grid (Defense Readiness on 2 cols + 3 Service Cards) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 shrink-0 lg:flex-1 lg:min-h-0 items-stretch">
            {/* Defense Readiness Card (2 cols) */}
            <div className="relative flex flex-col justify-between overflow-hidden apple-glass-card rounded-[24px] p-4 sm:p-5 lg:col-span-2 min-h-0">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                    <Target className="h-4 w-4" />
                  </div>
                  <h2 className="font-graphik text-xs sm:text-sm font-bold text-foreground tracking-tight uppercase">
                    DEFENSE READINESS
                  </h2>
                </div>
                <Link
                  to="/readiness"
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 no-underline"
                >
                  <span>Full Report</span>
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Circular Gauge Centerpiece */}
              <div className="flex flex-col items-center justify-center my-auto py-1 sm:py-2">
                <ReadinessGauge score={readinessScore} size={124} strokeWidth={10} />
                <div className="mt-2 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                  {readinessLabel}
                </div>
              </div>

              {/* Advice & Mini Breakdown Bars */}
              <div className="space-y-2">
                <p className="text-xs text-primary font-medium text-center line-clamp-1">
                  {readiness?.actions?.[0]?.text ??
                    "Raise your viva average with another focused session."}
                </p>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-0.5">
                      <span className="text-foreground/80">Viva performance</span>
                      <span className="text-foreground font-bold">
                        {Math.round(components[0]?.score ?? 78)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(components[0]?.score ?? 78)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold mb-0.5">
                      <span className="text-foreground/80">Presentation skills</span>
                      <span className="text-foreground font-bold">
                        {Math.round(components[1]?.score ?? 80)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(components[1]?.score ?? 80)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Launch CTA */}
              <button
                onClick={() => handleQuickDrill()}
                disabled={isStartingQuickViva !== null}
                className="w-full mt-3 apple-glass-btn-primary py-2.5 sm:py-3 rounded-2xl text-xs font-bold shadow-md flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>
                  {isStartingQuickViva ? "Launching Viva..." : "Launch Defense Simulation"}
                </span>
              </button>
            </div>

            {/* Service Card 1: AI Mock Viva */}
            <Link
              to="/ai-viva/new"
              className="group relative flex flex-col justify-between overflow-hidden apple-glass-card apple-glass-card-hover rounded-[24px] p-4 sm:p-5 no-underline lg:col-span-1 min-h-0"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                    <BrainCircuit className="h-5 w-5" />
                  </div>
                  <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2.5 py-1 rounded-full">
                    {vivaStats?.total_sessions ?? dashStats?.viva_sessions ?? 0} Vivas
                  </span>
                </div>
                <h3 className="font-bold text-foreground text-sm sm:text-base mb-1 group-hover:text-primary transition-colors font-graphik">
                  AI Mock Viva
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  Practice real interactions with Smart, Balanced, or Friendly AI professors.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-primary group-hover:gap-1.5 transition-all">
                <span>Start Mock Session</span>
                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>

            {/* Service Card 2: Slide Deck Mock */}
            <Link
              to="/ai-presentation"
              className="group relative flex flex-col justify-between overflow-hidden apple-glass-card apple-glass-card-hover rounded-[24px] p-4 sm:p-5 no-underline lg:col-span-1 min-h-0"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                    <MonitorSmartphone className="h-5 w-5" />
                  </div>
                  <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2.5 py-1 rounded-full">
                    {dashStats?.presentation_sessions ?? 0} Pitches
                  </span>
                </div>
                <h3 className="font-bold text-foreground text-sm sm:text-base mb-1 group-hover:text-primary transition-colors font-graphik">
                  Slide Deck Mock
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  Upload slides, create project scenarios, and get structured questions.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-primary group-hover:gap-1.5 transition-all">
                <span>Open Presentation Hub</span>
                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>

            {/* Service Card 3: Speech Coach */}
            <Link
              to="/advanced/sentiment-analysis"
              className="group relative flex flex-col justify-between overflow-hidden apple-glass-card apple-glass-card-hover rounded-[24px] p-4 sm:p-5 no-underline lg:col-span-1 min-h-0"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-[#7CE4BA] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                    <Video className="h-5 w-5" />
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-600 dark:text-[#7CE4BA] border border-emerald-500/20 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>
                <h3 className="font-bold text-foreground text-sm sm:text-base mb-1 group-hover:text-emerald-600 dark:group-hover:text-[#7CE4BA] transition-colors font-graphik">
                  Speech Coach
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  Real-time speech analytics, pace (WPM), clarity, and filler stats.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-[#7CE4BA] group-hover:gap-1.5 transition-all">
                <span>Enter Live Coach</span>
                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>

          {/* Row 2: 3-Column Core Workstation (Active Projects, Recent Sessions, Weakness Radar) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 shrink-0 lg:flex-1 lg:min-h-0 items-stretch">
            {/* Col 1: Active Projects */}
            <div className="flex flex-col justify-between apple-glass-card rounded-[24px] p-4 sm:p-5 min-h-0">
              <div className="flex items-center justify-between pb-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs shadow-xs">
                    <FolderKanban className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="font-graphik text-xs sm:text-sm font-bold text-foreground tracking-wide uppercase">
                    ACTIVE PROJECTS
                  </h2>
                </div>
                <Link
                  to="/projects"
                  className="text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors no-underline"
                >
                  View All ({allProjects.length})
                </Link>
              </div>

              <div className="flex flex-col gap-2.5 my-auto py-1 min-h-0 overflow-y-auto">
                {activeProjects.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-semibold text-foreground">No projects yet</p>
                    <Link
                      to="/projects/new"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary no-underline"
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
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-3 transition-colors hover:bg-black/8 dark:hover:bg-white/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/15 text-primary font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                            {title.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link
                                to="/projects/$id"
                                params={{ id }}
                                className="truncate text-xs font-bold text-foreground hover:text-primary transition-colors no-underline max-w-[130px] sm:max-w-[160px]"
                              >
                                {title}
                              </Link>
                              <span className="rounded-md bg-muted px-1.5 py-0.2 text-[9px] font-bold text-muted-foreground uppercase">
                                {projectType}
                              </span>
                            </div>
                            <div className="mt-1">
                              <div className="text-[9px] text-muted-foreground mb-0.5">
                                Progress {progress}%
                              </div>
                              <div className="w-28 sm:w-32 h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleQuickDrill(undefined, id)}
                          disabled={isStartingQuickViva === id}
                          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 apple-glass-btn-secondary rounded-xl text-foreground text-[10px] font-bold cursor-pointer"
                        >
                          <Target className="h-3 w-3 text-primary" />
                          <span>Defend</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Col 2: Recent Sessions */}
            <div className="flex flex-col justify-between apple-glass-card rounded-[24px] p-4 sm:p-5 min-h-0">
              <div className="flex items-center justify-between pb-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs shadow-xs">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="font-graphik text-xs sm:text-sm font-bold text-foreground tracking-wide uppercase">
                    RECENT SESSIONS
                  </h2>
                </div>
                <Link
                  to="/ai-viva"
                  className="text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors no-underline"
                >
                  History
                </Link>
              </div>

              <div className="flex flex-col gap-2.5 my-auto py-1 min-h-0 overflow-y-auto">
                {recentSessions.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-semibold text-foreground">No sessions completed</p>
                    <Link
                      to="/ai-viva/new"
                      className="mt-2 apple-glass-btn-primary inline-flex min-h-[38px] items-center gap-1.5 px-3.5 py-2 text-xs font-bold no-underline"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> Start First Viva
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
                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-3 transition-colors hover:bg-black/8 dark:hover:bg-white/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-xs">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-foreground max-w-[120px] sm:max-w-[150px]">
                              {subject}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              Examiner: {persona}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              score != null && score >= 75
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-[#7CE4BA]"
                                : "bg-primary/15 text-primary"
                            }`}
                          >
                            {score != null ? `${score}%` : "Pending"}
                          </span>
                          <Link
                            to="/ai-viva/session/$id"
                            params={{ id }}
                            className="px-3.5 py-1.5 apple-glass-btn-secondary rounded-xl text-foreground text-[10px] font-bold no-underline"
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

            {/* Col 3: Weakness Radar */}
            <div className="flex flex-col justify-between apple-glass-card rounded-[24px] p-4 sm:p-5 min-h-0">
              <div className="flex items-center justify-between pb-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center text-xs shadow-xs">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="font-graphik text-xs sm:text-sm font-bold text-foreground tracking-wide uppercase">
                    WEAKNESS RADAR
                  </h2>
                </div>
                <Link
                  to="/advanced/sentiment-analysis"
                  className="text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors no-underline"
                >
                  Analytics
                </Link>
              </div>

              <div className="flex flex-col gap-2.5 my-auto py-1 min-h-0 overflow-y-auto">
                {weakTopics.slice(0, 2).map((item, idx) => {
                  const topicName = typeof item === "string" ? item : item.topic;
                  const avgScore =
                    typeof item === "object" && item.avg_score ? Math.round(item.avg_score) : 55;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-3 transition-colors hover:bg-black/8 dark:hover:bg-white/10"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground max-w-[140px] sm:max-w-[180px]">
                          {topicName}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                          Avg: {avgScore}% • High Priority
                        </p>
                      </div>
                      <button
                        onClick={() => handleQuickDrill(topicName)}
                        disabled={isStartingQuickViva === topicName}
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2 apple-glass-btn-primary rounded-xl text-[10px] font-bold cursor-pointer disabled:opacity-50"
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
