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
  ClipboardCheck,
  Menu,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConsentGate } from "@/components/consent-gate";
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
  /** Full-viewport mode for ultra-compact, zero-scrolling modern dashboard layouts. */
  viewport = false,
}: {
  children: ReactNode;
  wide?: boolean;
  viewport?: boolean;
}) {
  const { ready, isLoading } = useRequireAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        <WideTopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="min-h-0 min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
        <MobileNav onOpenMenu={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <ConsentGate />
      </div>
    );
  }

  if (viewport) {
    return (
      <div className="relative h-screen w-screen max-h-screen overflow-hidden bg-background">
        {/* Apple-style atmospheric ambient light mesh */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-primary/10 blur-[130px] dark:bg-primary/15" />
          <div className="absolute top-[35%] -left-32 h-[500px] w-[500px] rounded-full bg-[oklch(0.772_0.024_205/0.12)] blur-[140px] dark:bg-[oklch(0.35_0.035_208/0.4)]" />
          <div className="absolute -bottom-40 right-[20%] h-[600px] w-[600px] rounded-full bg-primary/8 blur-[150px] dark:bg-primary/10" />
        </div>
        <div className="relative z-10 flex h-full w-full gap-3 sm:gap-4 p-3 sm:p-4 overflow-hidden">
          <IconRailSidebar />
          <main className="min-w-0 flex-1 h-full flex flex-col overflow-hidden">{children}</main>
        </div>
        <MobileNav onOpenMenu={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <ConsentGate />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      {/* Apple-style atmospheric ambient light mesh */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-primary/10 blur-[130px] dark:bg-primary/15" />
        <div className="absolute top-[35%] -left-32 h-[500px] w-[500px] rounded-full bg-[oklch(0.772_0.024_205/0.12)] blur-[140px] dark:bg-[oklch(0.35_0.035_208/0.4)]" />
        <div className="absolute -bottom-40 right-[20%] h-[600px] w-[600px] rounded-full bg-primary/8 blur-[150px] dark:bg-primary/10" />
      </div>
      <div className="relative z-10 flex w-full gap-6 p-3 sm:p-4 lg:p-6">
        <Sidebar />
        <main className="min-w-0 flex-1 space-y-6 pb-24 lg:pb-0">
          <TopBar onOpenMenu={() => setDrawerOpen(true)} />
          {children}
        </main>
      </div>
      <MobileNav onOpenMenu={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/* Mounted in the shell, not per route: consent gates every session
          feature, and it reads the profile the shell already has. */}
      <ConsentGate />
    </div>
  );
}

function IconRailSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const items = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/templates", icon: BookOpen, label: "Templates" },
    { to: "/projects", icon: FolderKanban, label: "Projects" },
    { to: "/readiness", icon: Gauge, label: "Readiness & Stats" },
    { to: "/ai-viva", icon: BrainCircuit, label: "Mock Viva" },
    { to: "/progress", icon: Bell, label: "Activity" },
    { to: "/profile", icon: Settings, label: "Settings" },
  ];

  return (
    <aside className="hidden h-full w-16 shrink-0 flex-col items-center justify-between rounded-3xl bg-card/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/10 py-4 px-2 shadow-[var(--shadow-glass)] lg:flex">
      {/* Top Monogram Logo */}
      <div className="flex flex-col items-center gap-4">
        <Link
          to="/"
          aria-label="VivAI Home"
          className="grid h-10 w-10 place-items-center rounded-2xl bg-foreground text-background shadow-md hover:scale-105 transition-transform"
        >
          <span className="font-extrabold text-base tracking-tighter">N</span>
        </Link>
      </div>

      {/* Middle Vertical Icon List */}
      <nav className="flex flex-col items-center gap-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={`relative grid h-10 w-10 place-items-center rounded-2xl transition-all ${
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {active && (
                <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2.5 w-1 rounded-r-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions: Theme Toggle & Logout */}
      <div className="flex flex-col items-center gap-2">
        <ThemeToggle compact />
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          title="Sign out"
          className="grid h-10 w-10 place-items-center rounded-2xl text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
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
    <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[236px] shrink-0 flex-col justify-between overflow-y-auto rounded-3xl bg-card/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/10 px-3 py-5 shadow-[var(--shadow-glass)] lg:flex">
      <div>
        <Link to="/" aria-label="Home" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
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
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                        active
                          ? "bg-foreground text-background shadow-xs"
                          : "text-muted-foreground hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
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
                  to="/faculty"
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    isActive("/faculty")
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
                  }`}
                >
                  <ClipboardCheck className="h-[18px] w-[18px] shrink-0" />
                  Faculty Console
                </Link>
                <Link
                  to="/admin"
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    isActive("/admin")
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
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
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
      >
        <LogOut className="h-[18px] w-[18px]" />
        Sign out
      </button>
    </aside>
  );
}

function WideTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = pageTitle(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 bg-card/75 px-3 backdrop-blur-2xl backdrop-saturate-150 sm:px-4 shadow-[var(--shadow-card)]">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link
        to="/"
        aria-label="Home"
        className="hidden grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:grid"
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
        className="hidden rounded-xl border border-border/80 bg-secondary/60 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
      >
        AI Tools
      </Link>
      <Link
        to="/"
        className="rounded-xl border border-border/80 bg-secondary/60 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Dashboard
      </Link>
      <ThemeToggle />
    </header>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
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
    <header className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-card/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/10 p-2.5 shadow-[var(--shadow-glass)] sm:p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:grid lg:hidden">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold sm:text-base">{title}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <div className="hidden items-center gap-1 rounded-full bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 p-1 min-[420px]:flex shadow-xs">
          <button
            aria-label="Search"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-card/90 transition-colors sm:h-9 sm:w-9"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            aria-label="Notifications"
            className="relative grid h-8 w-8 place-items-center rounded-full hover:bg-card/90 transition-colors sm:h-9 sm:w-9"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
        </div>
        <Link
          to="/profile"
          aria-label="Profile"
          className="flex items-center gap-2.5 rounded-full bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 py-1 pl-1 pr-2.5 hover:bg-secondary/90 transition-all shadow-xs sm:pr-4"
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-xs sm:h-9 sm:w-9 sm:text-sm">
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

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative flex w-4/5 max-w-xs flex-1 flex-col bg-card/90 backdrop-blur-2xl border-r border-white/30 dark:border-white/10 px-4 py-5 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <Link to="/" onClick={onClose} aria-label="Home" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">VivAI</span>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary/70 backdrop-blur-md border border-white/20 dark:border-white/10 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
          {navGroups.map((group) => (
            <div key={group.heading}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.heading}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                        active
                          ? "bg-foreground text-background shadow-xs"
                          : "text-muted-foreground hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Admin
              </p>
              <div className="flex flex-col gap-1">
                <Link
                  to="/faculty"
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    isActive("/faculty")
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
                  }`}
                >
                  <ClipboardCheck className="h-4 w-4 shrink-0" />
                  Faculty Console
                </Link>
                <Link
                  to="/admin"
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    isActive("/admin")
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:bg-secondary/70 hover:backdrop-blur-md hover:text-foreground"
                  }`}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  Institution Admin
                </Link>
              </div>
            </div>
          )}
        </nav>

        <div className="mt-4 border-t border-border pt-3 space-y-2">
          <button
            onClick={() => {
              onClose();
              logout();
              navigate({ to: "/login" });
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", icon: LayoutDashboard, label: "Home" },
    { to: "/pitch-drill", icon: Timer, label: "Pitch" },
    { to: "/ai-viva", icon: BrainCircuit, label: "Viva", center: true },
    { to: "/readiness", icon: Gauge, label: "Ready" },
    { to: "/projects", icon: FolderKanban, label: "Projects" },
  ];
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-3xl bg-card/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/40 dark:border-white/10 p-2 shadow-[var(--shadow-glass)] lg:hidden">
      {items.map((i) => {
        const Icon = i.icon;
        const active = i.to === "/" ? pathname === "/" : pathname.startsWith(i.to);
        if (i.center) {
          return (
            <Link
              key={i.to}
              to={i.to}
              aria-label={i.label}
              className="grid h-12 w-12 -translate-y-3 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
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
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition-all ${
              active ? "text-foreground font-semibold" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            {i.label}
          </Link>
        );
      })}
      <button
        onClick={onOpenMenu}
        aria-label="More options"
        className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Menu className="h-5 w-5" />
        More
      </button>
    </nav>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl bg-card/75 backdrop-blur-xl backdrop-saturate-150 border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:shadow-[var(--shadow-glass-hover)] ${className}`}
    >
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
    muted:
      "bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 text-muted-foreground",
    primary: "bg-primary-soft/80 backdrop-blur-md border border-primary/20 text-accent-foreground",
    success: "bg-success/15 backdrop-blur-md border border-success/20 text-success",
    warning: "bg-warning/15 backdrop-blur-md border border-warning/20 text-warning",
    destructive: "bg-destructive/15 backdrop-blur-md border border-destructive/20 text-destructive",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-xs ${tones[tone]}`}
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
    "/faculty": "Faculty Console",
  };
  if (map[pathname]) return map[pathname];
  const match = Object.keys(map)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? map[match] : "VivAI";
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={`grid place-items-center rounded-2xl bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 text-foreground hover:bg-secondary/90 transition-all shadow-xs ${
        compact ? "h-10 w-10" : "h-10 w-10 rounded-full"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
