import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  BrainCircuit,
  MonitorSmartphone,
  Users,
  FileText,
  Settings,
  Search,
  Bell,
  HelpCircle,
  LogOut,
  GraduationCap,
  Sparkles,
  Sun,
  Moon,
  Target,
  Gauge,
  Timer,
  Trophy,
  Video,
  Building2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/hooks";

type NavItem = { to: string; icon: typeof LayoutDashboard; label: string };

const navGroups: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    heading: "Practice",
    items: [
      { to: "/ai-viva", icon: BrainCircuit, label: "Mock Viva" },
      { to: "/ai-presentation", icon: MonitorSmartphone, label: "Presentation" },
      { to: "/pitch-drill", icon: Timer, label: "Pitch Drill" },
      { to: "/advanced/sentiment-analysis", icon: Video, label: "Live Coach" },
      { to: "/ai", icon: Sparkles, label: "AI Tools" },
    ],
  },
  {
    heading: "Insights",
    items: [
      { to: "/readiness", icon: Gauge, label: "Readiness" },
      { to: "/progress", icon: Target, label: "Progress" },
      { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { to: "/projects", icon: FolderKanban, label: "Projects" },
      { to: "/templates", icon: BookOpen, label: "Templates" },
      { to: "/teams", icon: Users, label: "Teams" },
      { to: "/files", icon: FileText, label: "Files" },
      { to: "/profile", icon: Settings, label: "Profile" },
    ],
  },
];

export function AppShell({
  children,
  /** Full-width workspace: hides the left sidebar so dense tools (e.g. Code-Aware) can breathe. */
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const { ready, isLoading } = useRequireAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!ready) return null;
  if (wide) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <WideTopBar />
        <main className="min-h-0 min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
        <MobileNav />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <div className="flex w-full gap-6 p-4 lg:p-6">
        <Sidebar />
        <main className="min-w-0 flex-1 space-y-6 pb-24 lg:pb-0">
          <TopBar />
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[236px] shrink-0 flex-col justify-between overflow-y-auto rounded-3xl bg-card px-3 py-5 shadow-[var(--shadow-card)] lg:flex">
      <div>
        <Link to="/" aria-label="Home" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">VivAI</span>
        </Link>
        <nav className="flex flex-col gap-5">
          {navGroups.map((group) => (
            <div key={group.heading}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.heading}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {isAdmin && (
            <div>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Admin
              </p>
              <div className="flex flex-col gap-0.5">
                <Link
                  to="/admin"
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive("/admin")
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Building2 className="h-[18px] w-[18px] shrink-0" />
                  Institution
                </Link>
              </div>
            </div>
          )}
        </nav>
      </div>
      <button
        onClick={() => {
          logout();
          navigate({ to: "/login" });
        }}
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <LogOut className="h-[18px] w-[18px]" />
        Sign out
      </button>
    </aside>
  );
}

function WideTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = pageTitle(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
      <Link
        to="/"
        aria-label="Home"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
      >
        <GraduationCap className="h-4 w-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
          Full workspace · sidebar hidden for more room
        </p>
      </div>
      <Link
        to="/ai"
        className="hidden rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
      >
        AI Tools
      </Link>
      <Link
        to="/"
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Dashboard
      </Link>
      <ThemeToggle />
    </header>
  );
}

function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const fullName = String(profile?.full_name ?? "Student");
  const initials =
    fullName
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";
  const meta = [
    profile?.year ? `${String(profile.year)} Year` : null,
    profile?.branch ? String(profile.branch) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const title = pageTitle(pathname);
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl bg-card p-3 shadow-[var(--shadow-card)] sm:flex sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground lg:hidden">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold sm:text-base">{title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
          <button
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-card"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            aria-label="Notifications"
            className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-card"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <button
            aria-label="Info"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-card"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
        <Link
          to="/profile"
          className="flex items-center gap-3 rounded-full bg-secondary py-1 pl-1 pr-4 hover:bg-secondary/80"
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-semibold leading-tight">{fullName}</div>
            <div className="text-xs text-muted-foreground">{meta || "Set up your profile"}</div>
          </div>
        </Link>
      </div>
    </header>
  );
}

function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", icon: LayoutDashboard, label: "Home" },
    { to: "/pitch-drill", icon: Timer, label: "Pitch" },
    { to: "/ai-viva", icon: BrainCircuit, label: "Viva", center: true },
    { to: "/readiness", icon: Gauge, label: "Ready" },
    { to: "/projects", icon: FolderKanban, label: "Projects" },
  ];
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl bg-card p-2 shadow-[var(--shadow-card)] lg:hidden">
      {items.map((i) => {
        const Icon = i.icon;
        const active = i.to === "/" ? pathname === "/" : pathname.startsWith(i.to);
        if (i.center) {
          return (
            <Link
              key={i.to}
              to={i.to}
              aria-label={i.label}
              className="grid h-12 w-12 -translate-y-3 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        }
        return (
          <Link
            key={i.to}
            to={i.to}
            aria-label={i.label}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] ${
              active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "success" | "warning" | "destructive";
}) {
  const tones = {
    muted: "bg-secondary text-muted-foreground",
    primary: "bg-primary-soft text-accent-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function pageTitle(pathname: string): string {
  const map: Record<string, string> = {
    "/": "Dashboard",
    "/ai": "AI Tools",
    "/ai-viva": "Mock Viva",
    "/ai-presentation": "Presentation Coach",
    "/pitch-drill": "90-Second Pitch Drill",
    "/advanced/sentiment-analysis": "AI Communication Coach",
    "/advanced/viva-code-aware": "Code-Aware Viva",
    "/readiness": "Defense Readiness",
    "/progress": "Progress",
    "/leaderboard": "Leaderboard",
    "/projects": "Projects",
    "/templates": "Templates",
    "/teams": "Teams",
    "/files": "Files",
    "/profile": "Profile",
    "/privacy": "Privacy Policy",
    "/admin": "Institution Admin",
  };
  if (map[pathname]) return map[pathname];
  const match = Object.keys(map)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? map[match] : "VivAI";
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-foreground hover:bg-secondary/80"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
