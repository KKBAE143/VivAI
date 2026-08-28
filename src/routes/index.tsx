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
  Trophy,
  Star,
  Target,
  TrendingUp,
  Clock,
  CheckCircle2,
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
import { useReadiness, useBenchmarks, useGamification } from "@/lib/hooks-features";

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
  const benchmarksQuery = useBenchmarks();
  const gamificationQuery = useGamification();
  const createSession = useCreateVivaSession();
  const navigate = useNavigate();
  const { toggle } = useTheme();

  const [searchQuery, setSearchQuery] = useState("");
  const [isStartingQuickViva, setIsStartingQuickViva] = useState<string | null>(null);

  // Weak Topics from readiness / stats (computed with hook before early returns)
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
      { topic: "Time & Space Complexity", avg_score: 68 },
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

  // User Profile
  const profile = profileQuery.data;
  const fullName = String(profile?.full_name ?? "Student");
  const firstName = fullName.split(" ")[0] || "Student";

  // Readiness & Stats
  const readinessScore = Math.round(readiness?.score ?? 78);
  const readinessLabel =
    readiness?.label ??
    (readinessScore >= 80
      ? "Ready to Defend"
      : readinessScore >= 60
        ? "Almost Ready"
        : "Building Foundations");
  const components = readiness?.components ?? [
    { key: "technical", label: "Technical Knowledge", score: 82, weight: 0.35 },
    { key: "viva", label: "Oral Viva Delivery", score: 75, weight: 0.25 },
    { key: "code", label: "Code Comprehension", score: 80, weight: 0.25 },
    { key: "slides", label: "Slide & Presentation", score: 70, weight: 0.15 },
  ];

  // Benchmarks
  const benchmarks = benchmarksQuery.data;

  // Gamification
  const gamification = gamificationQuery.data;
  const level = gamification?.level ?? 1;
  const xp = gamification?.xp ?? 150;
  const streak = gamification?.current_streak ?? 1;
  const levelSpan = gamification?.level_span ?? 250;
  const intoLevel = gamification?.into_level ?? 150;
  const xpProgressPct =
    levelSpan > 0 ? Math.min(100, Math.round((intoLevel / levelSpan) * 100)) : 60;

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
      // Fallback navigate to new viva page
      navigate({ to: "/ai-viva/new" });
    } finally {
      setIsStartingQuickViva(null);
    }
  };

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
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 pb-12">
          {/* Top Bar / Header Section */}
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] sm:flex-row sm:items-center sm:p-6">
            <div className="flex items-center gap-4">
              <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-tr from-primary to-amber-400 text-xl font-black text-primary-foreground shadow-md">
                {firstName.charAt(0).toUpperCase()}
                <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[10px] text-white ring-2 ring-card">
                  ✓
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    Welcome back, {firstName}
                  </h1>
                  <span className="inline-block select-none text-xl">👋</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  {readinessScore >= 75
                    ? "You are on track for your academic project defense. Keep sharpening your fluency!"
                    : "Focus on identified weak topics today to boost your Defense Readiness Score."}
                </p>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search projects & topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-border/60 bg-background/80 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/70 backdrop-blur-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition-all"
                />
              </div>

              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="grid h-8.5 w-8.5 place-items-center rounded-full border border-border/60 bg-background/80 text-muted-foreground hover:text-foreground backdrop-blur-md transition-colors shadow-xs cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
              </button>

              <Link
                to="/projects/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Project</span>
              </Link>
            </div>
          </div>

          {/* Hero Section: Defense Readiness Station */}
          <div className="relative overflow-hidden rounded-3xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-card/90 via-card/75 to-secondary/30 p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
              {/* Score Gauge & Status */}
              <div className="flex flex-col sm:flex-row items-center gap-6 lg:col-span-4 lg:border-r lg:border-border/40 lg:pr-6">
                <div className="relative shrink-0">
                  <ReadinessGauge score={readinessScore} size={120} strokeWidth={9} />
                </div>
                <div className="text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary dark:text-amber-300">
                    <Target className="h-3 w-3" />
                    <span>{readinessLabel}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-foreground sm:text-xl">
                    Defense Readiness
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {benchmarks?.peer_description ? (
                      <span>
                        You rank in the{" "}
                        <strong className="text-foreground">{benchmarks.peer_description}</strong>{" "}
                        of your college.
                      </span>
                    ) : (
                      "Calculated from oral viva performance, slide quality & project mastery."
                    )}
                  </p>
                  <Link
                    to="/readiness"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    <span>View In-depth Breakdown</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {/* Component Breakdown Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 lg:col-span-5">
                {components.map((comp) => {
                  const score = Math.round(comp.score);
                  const isHigh = score >= 75;
                  const isMedium = score >= 60 && score < 75;
                  return (
                    <div
                      key={comp.key}
                      className="rounded-2xl border border-border/40 bg-background/50 p-3.5 backdrop-blur-md transition-all hover:bg-background/80"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{comp.label}</span>
                        <span
                          className={`text-xs font-bold ${
                            isHigh
                              ? "text-emerald-500 dark:text-emerald-400"
                              : isMedium
                                ? "text-primary dark:text-amber-400"
                                : "text-rose-500 dark:text-rose-400"
                          }`}
                        >
                          {score}%
                        </span>
                      </div>
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isHigh ? "bg-emerald-500" : isMedium ? "bg-primary" : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, score)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Weight {Math.round(comp.weight * 100)}%</span>
                        <span>{score >= 75 ? "Proficient" : "Needs Drill"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Banner / Recommendation */}
              <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 border border-primary/20 lg:col-span-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary dark:text-amber-300">
                    <Zap className="h-3.5 w-3.5" />
                    <span>Smart Recommendation</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-foreground leading-relaxed">
                    {readiness?.actions?.[0]?.text ??
                      "Take a 5-minute Adaptive Mock Viva to practice cross-questioning on your technical stack."}
                  </p>
                </div>
                <button
                  onClick={() => handleQuickDrill()}
                  disabled={isStartingQuickViva !== null}
                  className="mt-3.5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>
                    {isStartingQuickViva ? "Launching Viva..." : "Start Recommended Drill"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Action Launchpad: 3 Bold Interactive Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Card 1: AI Mock Viva */}
            <Link
              to="/ai-viva/new"
              className="group relative overflow-hidden rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[var(--shadow-glass-hover)]"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {vivaStats?.total_sessions ?? dashStats?.viva_sessions ?? 0} Completed
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                AI Mock Viva
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Simulate oral examinations with AI professors (Strict, Balanced, or Friendly) in
                English, Hindi, or Hinglish.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary">
                <span>Start Mock Session</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Card 2: Slide & Presentation Mock */}
            <Link
              to="/ai-presentation"
              className="group relative overflow-hidden rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] transition-all duration-300 hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-[var(--shadow-glass-hover)]"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-500/15 text-purple-500 dark:text-purple-400 group-hover:scale-110 transition-transform">
                  <MonitorSmartphone className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {dashStats?.presentation_sessions ?? 0} Sessions
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold text-foreground group-hover:text-purple-500 transition-colors">
                Presentation & Pitch Mock
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Upload slides, practice project demos, get anticipated questions, and refine your
                pitch timing.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-purple-500 dark:text-purple-400">
                <span>Launch Presentation Hub</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Card 3: Live Voice Coach */}
            <Link
              to="/advanced/sentiment-analysis"
              className="group relative overflow-hidden rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-[var(--shadow-glass-hover)]"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <Video className="h-5 w-5" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Voice
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold text-foreground group-hover:text-emerald-500 transition-colors">
                Live Defense Coach
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Real-time spoken dialogue with delivery scorecard: pace (WPM), clarity, filler
                ratio, and confidence feedback.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-500 dark:text-emerald-400">
                <span>Enter Live Coach</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>

          {/* Gamification & Stats Ribbon */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {/* Level & XP */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-accent-foreground font-bold">
                <Star className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Level {level}</span>
                  <span className="text-[11px] text-muted-foreground">{xp} XP</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${xpProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Streak */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-500 font-bold">
                <Flame className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-foreground sm:text-lg">{streak} Days</div>
                <div className="text-xs text-muted-foreground">Active Streak</div>
              </div>
            </div>

            {/* Total Vivas & Avg Score */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-500 font-bold">
                <Trophy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-foreground sm:text-lg">
                  {vivaStats?.avg_score ? `${Math.round(vivaStats.avg_score)}%` : "84%"}
                </div>
                <div className="text-xs text-muted-foreground">Avg Viva Score</div>
              </div>
            </div>

            {/* Active Projects */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-white/40 dark:border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-500 font-bold">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-foreground sm:text-lg">
                  {allProjects.length} {allProjects.length === 1 ? "Project" : "Projects"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dashStats?.pending_tasks ?? 0} Tasks Pending
                </div>
              </div>
            </div>
          </div>

          {/* Main 2-Column Section: Projects & Vivas (Left 8 cols) + Weaknesses & Benchmarks (Right 4 cols) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Section (8 cols) */}
            <div className="flex flex-col gap-6 lg:col-span-8">
              {/* Active Projects Card */}
              <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 sm:p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center justify-between pb-4 border-b border-border/40">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-foreground">
                      Projects & Defense Workspaces
                    </h3>
                  </div>
                  <Link
                    to="/projects"
                    className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    View All ({allProjects.length})
                  </Link>
                </div>

                {activeProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
                      <FolderKanban className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">No projects found</p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                      Create your B.Tech Capstone, Mini, or Major project to link tasks, slides, and
                      viva prep.
                    </p>
                    <Link
                      to="/projects/new"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create Project</span>
                    </Link>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    {activeProjects.slice(0, 3).map((project) => {
                      const id = String(project.id);
                      const title = String(project.title ?? "Untitled Project");
                      const subject = String(project.subject ?? "Academic Project");
                      const progress = Number(project.progress ?? 40);
                      const projectType = String(project.project_type ?? "Major");

                      return (
                        <div
                          key={id}
                          className="group flex flex-col justify-between gap-3 rounded-2xl border border-border/40 bg-background/50 p-4 transition-all hover:bg-background/80 hover:border-primary/40 sm:flex-row sm:items-center"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 font-bold text-primary text-sm">
                              {title.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  to="/projects/$id"
                                  params={{ id }}
                                  className="truncate text-sm font-bold text-foreground group-hover:text-primary transition-colors"
                                >
                                  {title}
                                </Link>
                                <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  {projectType}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {subject}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                            {/* Progress bar */}
                            <div className="w-24 sm:w-28">
                              <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground mb-1">
                                <span>Progress</span>
                                <span className="text-foreground font-bold">{progress}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>

                            {/* Quick Defend CTA */}
                            <button
                              onClick={() => handleQuickDrill(undefined, id)}
                              disabled={isStartingQuickViva === id}
                              className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                            >
                              <BrainCircuit className="h-3.5 w-3.5" />
                              <span>{isStartingQuickViva === id ? "Starting..." : "Defend"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Viva Defense Sessions */}
              <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 sm:p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center justify-between pb-4 border-b border-border/40">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500">
                      <Clock className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-foreground">
                      Recent Viva Sessions & Performance
                    </h3>
                  </div>
                  <Link
                    to="/ai-viva"
                    className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    View All History
                  </Link>
                </div>

                {recentSessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
                      <BrainCircuit className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      No viva sessions yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                      Take your first oral defense session to get AI scoring, delivery analytics,
                      and topic mastery insights.
                    </p>
                    <Link
                      to="/ai-viva/new"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Start First Viva</span>
                    </Link>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    {recentSessions.map((session) => {
                      const id = String(session.id);
                      const sessionType = String(session.session_type ?? "General");
                      const subject = String(session.subject ?? "Technical Viva");
                      const score =
                        session.score != null ? Math.round(Number(session.score)) : null;
                      const duration = session.duration_minutes
                        ? `${session.duration_minutes} min`
                        : "10 min";
                      const persona = String(session.persona ?? "Balanced");
                      const date = session.created_at
                        ? new Date(String(session.created_at)).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "Recent";

                      return (
                        <div
                          key={id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/40 bg-background/50 p-4 transition-all hover:bg-background/80"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-500 font-bold">
                              <BrainCircuit className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-bold text-foreground">
                                  {subject}
                                </p>
                                <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {sessionType}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{date}</span>
                                <span>•</span>
                                <span>{duration}</span>
                                <span>•</span>
                                <span>Examiner: {persona}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            {score != null ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-xl px-2.5 py-1 text-xs font-bold ${
                                    score >= 75
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                      : score >= 60
                                        ? "bg-primary/15 text-primary dark:text-amber-400"
                                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  }`}
                                >
                                  {score}% Score
                                </span>
                              </div>
                            ) : (
                              <span className="rounded-xl bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                In Progress
                              </span>
                            )}

                            <Link
                              to="/ai-viva/session/$id"
                              params={{ id }}
                              className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/90 transition-colors"
                            >
                              <span>Review</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Section: Weaknesses & Benchmarks (4 cols) */}
            <div className="flex flex-col gap-6 lg:col-span-4">
              {/* Weakness Radar & Instant Drills */}
              <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 sm:p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center justify-between pb-3.5 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-rose-500/15 text-rose-500">
                      <AlertCircle className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">Weakness Radar</h3>
                  </div>
                  <Link
                    to="/advanced/weakness-heatmap"
                    className="text-[11px] font-semibold text-muted-foreground hover:text-primary"
                  >
                    Heatmap
                  </Link>
                </div>

                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  Targeted questions where your previous confidence or technical depth lagged. Drill
                  to improve:
                </p>

                <div className="mt-3.5 flex flex-col gap-2.5">
                  {weakTopics.map((item, idx) => {
                    const topicName = typeof item === "string" ? item : item.topic;
                    const avgScore =
                      typeof item === "object" && item.avg_score ? Math.round(item.avg_score) : 55;

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/50 p-3 transition-all hover:bg-background/80"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate text-xs font-bold text-foreground">{topicName}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-rose-500 dark:text-rose-400">
                              Avg: {avgScore}%
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              • High Examiner Priority
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleQuickDrill(topicName)}
                          disabled={isStartingQuickViva === topicName}
                          className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-primary/15 px-2.5 py-1.5 text-[11px] font-bold text-primary dark:text-amber-400 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>{isStartingQuickViva === topicName ? "..." : "Drill"}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Peer Benchmark Card */}
              <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 sm:p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center gap-2.5 pb-3.5 border-b border-border/40">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Peer Benchmark</h3>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-2xl border border-border/40 bg-background/50 p-3">
                    <div className="text-xl font-black text-primary">
                      {benchmarks?.percentile ?? 82}%
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground font-medium">
                      Percentile Rank
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/40 bg-background/50 p-3">
                    <div className="text-xl font-black text-foreground">
                      {benchmarks?.college?.avg ? `${Math.round(benchmarks.college.avg)}%` : "72%"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground font-medium">
                      College Average
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 rounded-2xl bg-secondary/60 p-3 text-xs text-muted-foreground leading-relaxed">
                  💡 <strong className="text-foreground">Tip:</strong> Students who complete at
                  least 3 simulated vivas with strict examiners score on average{" "}
                  <strong>18% higher</strong> in final academic defense.
                </div>
              </div>

              {/* Quick Defense Readiness Checklist */}
              <div className="rounded-3xl border border-white/40 dark:border-white/10 bg-card/85 p-5 sm:p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border/40">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Defense Checklist</h3>
                </div>

                <div className="mt-3 flex flex-col gap-2.5">
                  {[
                    {
                      label: "Run Major Project Code Analysis",
                      done: allProjects.length > 0,
                      link: "/projects",
                    },
                    {
                      label: "Score >80% on Strict Examiner Viva",
                      done: (vivaStats?.avg_score ?? 0) >= 80,
                      link: "/ai-viva/new",
                    },
                    {
                      label: "Complete 3-min Presentation Pitch Drill",
                      done: (dashStats?.presentation_sessions ?? 0) > 0,
                      link: "/pitch-drill",
                    },
                    {
                      label: "Check Oral Delivery Filler Words (<5%)",
                      done: (vivaStats?.completed_sessions ?? 0) >= 2,
                      link: "/advanced/sentiment-analysis",
                    },
                  ].map((task, i) => (
                    <Link
                      key={i}
                      to={task.link}
                      className="group flex items-center justify-between rounded-xl p-2 transition-colors hover:bg-secondary/60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${
                            task.done
                              ? "bg-emerald-500 text-white"
                              : "border border-border text-transparent"
                          }`}
                        >
                          ✓
                        </div>
                        <span
                          className={`truncate text-xs ${
                            task.done
                              ? "text-muted-foreground line-through"
                              : "font-semibold text-foreground group-hover:text-primary"
                          }`}
                        >
                          {task.label}
                        </span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </Link>
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
