import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  BrainCircuit,
  MonitorSmartphone,
  Users,
  CheckSquare,
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
} from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/hooks";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ai", icon: Sparkles, label: "AI Hub" },
  { to: "/templates", icon: BookOpen, label: "Templates" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ai-viva", icon: BrainCircuit, label: "AI Viva" },
  { to: "/ai-presentation", icon: MonitorSmartphone, label: "Presentation" },
  { to: "/teams", icon: Users, label: "Teams" },
  { to: "/progress", icon: CheckSquare, label: "Progress" },
  { to: "/files", icon: FileText, label: "Files" },
  { to: "/profile", icon: Settings, label: "Profile" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, isLoading } = useRequireAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!ready) return null;
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
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[72px] shrink-0 flex-col items-center justify-between rounded-3xl bg-card py-5 shadow-[var(--shadow-card)] lg:flex">
      <div className="flex flex-col items-center gap-1">
        <Link
          to="/"
          aria-label="Home"
          className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground"
        >
          <GraduationCap className="h-5 w-5" />
        </Link>
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className={`grid h-11 w-11 place-items-center rounded-xl transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-1">
        <button aria-label="Help" className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-secondary">
          <HelpCircle className="h-5 w-5" />
        </button>
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          aria-label="Sign out"
          className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
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
  const tabs = [
    { label: "Overview", to: "/" },
    { label: "Projects", to: "/projects" },
    { label: "Viva", to: "/ai-viva" },
    { label: "Teams", to: "/teams" },
    { label: "Progress", to: "/progress" },
  ];
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl bg-card p-3 shadow-[var(--shadow-card)] sm:flex sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground lg:hidden">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="hidden items-center gap-1 rounded-full bg-secondary p-1 md:flex">
          {tabs.map((t) => {
            const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
          <button aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full hover:bg-card">
            <Search className="h-4 w-4" />
          </button>
          <button aria-label="Notifications" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-card">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <button aria-label="Info" className="grid h-9 w-9 place-items-center rounded-full hover:bg-card">
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
    { to: "/projects", icon: FolderKanban, label: "Projects" },
    { to: "/ai-viva", icon: BrainCircuit, label: "Viva", center: true },
    { to: "/teams", icon: Users, label: "Teams" },
    { to: "/profile", icon: Settings, label: "Profile" },
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
    <div className={`rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] ${className}`}>{children}</div>
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
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