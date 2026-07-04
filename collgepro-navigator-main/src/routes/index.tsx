import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderKanban,
  Calendar,
  ListChecks,
  BrainCircuit,
  MonitorSmartphone,
  ArrowUpRight,
  ChevronRight,
  Mic,
  Plus,
  Crown,
  Sparkles,
} from "lucide-react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useDashboard,
  useMe,
  useProfile,
  useProjects,
  useTeams,
  useVivaSessions,
  type ApiRecord,
  type DashboardStats,
} from "@/lib/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — CollgePro Navigator" },
      { name: "description", content: "Stay on top of your tasks, monitor progress, and track status across all your academic projects." },
      { property: "og:title", content: "CollgePro Navigator" },
      { property: "og:description", content: "The smarter way for B.Tech students to manage projects and prep for vivas." },
    ],
  }),
  component: Dashboard,
});

function daysUntil(deadline: unknown): { label: string; days: number | null } {
  if (!deadline) return { label: "No deadline", days: null };
  const due = new Date(String(deadline));
  if (Number.isNaN(due.getTime())) return { label: "No deadline", days: null };
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Overdue by ${Math.abs(days)} days`, days };
  if (days === 0) return { label: "Due today", days };
  return { label: `Due in ${days} days`, days };
}

function Dashboard() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const profileQuery = useProfile();
  const projectsQuery = useProjects();
  const sessionsQuery = useVivaSessions();
  const teamsQuery = useTeams();
  const dashboardQuery = useDashboard();
  const meQuery = useMe();

  const queries = [profileQuery, projectsQuery, sessionsQuery, teamsQuery, dashboardQuery] as const;
  const loading = authLoading || queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.error);

  if (!authLoading && !ready) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = String(profileQuery.data?.full_name ?? "Student").split(" ")[0];

  return (
    <AppShell>
      {loading ? (
        <DashboardSkeleton />
      ) : failed ? (
        <ErrorState
          message={failed.error instanceof Error ? failed.error.message : "Could not load your dashboard"}
          onRetry={() => {
            for (const q of queries) void q.refetch();
          }}
        />
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{`Good ${greeting}, ${firstName}`}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Stay on top of your tasks, monitor progress, and track status.</p>
          </div>

          <StatRow stats={dashboardQuery.data} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <ActiveProjectsCard projects={projectsQuery.data ?? []} />
              <UpcomingThisWeekCard projects={projectsQuery.data ?? []} />
            </div>
            <div className="space-y-5">
              <QuickPrepCard />
              <RecentSessionsCard sessions={sessionsQuery.data ?? []} />
            </div>
          </div>

          <YourTeamsCard teams={teamsQuery.data ?? []} meId={meQuery.data?.id ?? null} />
        </>
      )}
    </AppShell>
  );
}

function StatRow({ stats }: { stats?: DashboardStats }) {
  const pending = stats?.pending_tasks ?? 0;
  const items: {
    label: string;
    value: string;
    delta: string;
    tone: "up" | "down";
    icon: typeof FolderKanban;
    tint: "muted" | "primary";
  }[] = [
    {
      label: "Active Projects",
      value: String(stats?.active_projects ?? 0),
      delta: `${stats?.total_projects ?? 0} total`,
      tone: "up",
      icon: FolderKanban,
      tint: "muted",
    },
    {
      label: "Avg Progress",
      value: `${stats?.avg_progress ?? 0}%`,
      delta: "across all projects",
      tone: "up",
      icon: Calendar,
      tint: "muted",
    },
    {
      label: "Pending Tasks",
      value: String(pending),
      delta: pending > 0 ? "needs attention" : "all clear",
      tone: pending > 0 ? "down" : "up",
      icon: ListChecks,
      tint: "muted",
    },
    {
      label: "Practice Sessions",
      value: String((stats?.viva_sessions ?? 0) + (stats?.presentation_sessions ?? 0)),
      delta: stats?.avg_viva_score != null ? `${stats.avg_viva_score}% avg viva score` : "start practicing",
      tone: "up",
      icon: BrainCircuit,
      tint: "primary",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((s) => {
        const I = s.icon;
        const primary = s.tint === "primary";
        return (
          <div
            key={s.label}
            className={`rounded-2xl p-5 shadow-[var(--shadow-card)] ${
              primary ? "bg-primary-soft" : "bg-card"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <I className={`h-4 w-4 ${primary ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="mt-4 text-3xl font-bold tracking-tight text-foreground">{s.value}</div>
            <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${s.tone === "up" ? "text-success" : "text-warning"}`}>
              <ArrowUpRight className={`h-3 w-3 ${s.tone === "down" ? "rotate-180" : ""}`} /> {s.delta}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActiveProjectsCard({ projects }: { projects: ApiRecord[] }) {
  const visible = projects.slice(0, 4);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Your Active Projects</h3>
        <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first PBL, Major or Mini project to get started."
          action={
            <Link to="/projects/new" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> New Project
            </Link>
          }
        />
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {visible.map((p) => {
            const progress = Number(p.progress ?? 0);
            const due = daysUntil(p.deadline);
            const tag = String(p.type ?? "PBL").toUpperCase();
            return (
              <Link
                key={String(p.id)}
                to="/projects/$id"
                params={{ id: String(p.id) }}
                className="block rounded-xl border border-border bg-background/50 p-4 transition-colors hover:border-primary"
              >
                <Badge tone={tag === "MAJOR" ? "primary" : "muted"}>{tag}</Badge>
                <div className="mt-3 truncate font-semibold">{String(p.title)}</div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold">{progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <div className={`mt-3 flex items-center gap-1 text-[11px] ${due.days !== null && due.days < 3 ? "text-destructive" : "text-success"}`}>
                  <Calendar className="h-3 w-3" /> {due.label}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function UpcomingThisWeekCard({ projects }: { projects: ApiRecord[] }) {
  const upcoming = projects
    .filter((p) => Boolean(p.deadline))
    .map((p) => ({ record: p, dueDate: new Date(String(p.deadline)) }))
    .filter((p) => !Number.isNaN(p.dueDate.getTime()))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 4);
  return (
    <Card>
      <h3 className="text-base font-semibold">Upcoming Deadlines</h3>
      {upcoming.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No upcoming deadlines — add deadlines to your projects to see them here.</p>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {upcoming.map(({ record, dueDate }) => {
            const days = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);
            const dotClass = days < 3 ? "bg-destructive" : days < 7 ? "bg-warning" : "bg-success";
            return (
              <div key={String(record.id)} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-center">
                  <div>
                    <div className="text-sm font-bold leading-none text-accent-foreground">{String(dueDate.getDate()).padStart(2, "0")}</div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-accent-foreground/80">
                      {dueDate.toLocaleString("en", { month: "short" }).toUpperCase()}
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{String(record.title)}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {String(record.type ?? "")}{record.subject ? ` · ${String(record.subject)}` : ""}
                  </div>
                </div>
                <span className={`h-2 w-2 rounded-full ${dotClass}`} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function QuickPrepCard() {
  return (
    <Card>
      <h3 className="text-base font-semibold">Quick Prep</h3>
      <div className="mt-4 space-y-3">
        <Link
          to="/ai-viva/new"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
        >
          <Mic className="h-4 w-4" /> Start a Mock Viva
        </Link>
        <Link
          to="/ai-presentation"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3.5 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
        >
          <MonitorSmartphone className="h-4 w-4" /> Practice Presentation
        </Link>
        <Link
          to="/ai"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm font-semibold text-accent-foreground"
        >
          <Sparkles className="h-4 w-4" /> Explore all AI tools
        </Link>
      </div>
    </Card>
  );
}

function RecentSessionsCard({ sessions }: { sessions: ApiRecord[] }) {
  const visible = sessions.slice(0, 5);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Recent Sessions</h3>
        <Link to="/ai-viva" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No sessions yet — start a mock viva to see your history here.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((s) => {
            const score = s.score == null ? null : Number(s.score);
            const title = `${String(s.session_type ?? "Viva")} Viva${s.subject ? ` — ${String(s.subject)}` : ""}`;
            return (
              <div key={String(s.id)} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-accent-foreground">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{title}</div>
                  <div className="text-[11px] text-muted-foreground">{String(s.created_at ?? "").slice(0, 10)}</div>
                </div>
                {score !== null ? (
                  <Badge tone={score >= 80 ? "success" : "warning"}>{score}%</Badge>
                ) : (
                  <Badge tone="muted">{String(s.status ?? "Pending")}</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function YourTeamsCard({ teams, meId }: { teams: ApiRecord[]; meId: string | null }) {
  const visible = teams.slice(0, 3);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Your Teams</h3>
        <Link to="/teams" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((t) => {
          const members = (t.team_members as ApiRecord[] | undefined) ?? [];
          const lead = members.some((m) => m.profile_id === meId && m.role === "Lead");
          return (
            <div key={String(t.id)} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{String(t.name)}</div>
                {lead && <Badge tone="warning"><Crown className="h-3 w-3" /> Lead</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t.project_id ? "Linked to a project" : "No project linked yet"}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex -space-x-2">
                  {members.slice(0, 4).map((m, i) => {
                    const profile = m.profiles as ApiRecord | null | undefined;
                    const initial = String(profile?.full_name ?? "M").charAt(0).toUpperCase();
                    return (
                      <div key={i} className="grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-secondary text-[9px] font-semibold">
                        {initial}
                      </div>
                    );
                  })}
                </div>
                <span className="text-[11px] text-muted-foreground">{members.length} members</span>
              </div>
            </div>
          );
        })}
        <Link
          to="/teams"
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">Create New Team</span>
        </Link>
      </div>
    </Card>
  );
}