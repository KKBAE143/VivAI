import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  BrainCircuit,
  MonitorSmartphone,
  Users,
  Settings,
  Search,
  Bell,
  LogOut,
  GraduationCap,
  Sparkles,
  Sun,
  Moon,
  Gauge,
  Timer,
  Video,
  Building2,
  ClipboardCheck,
  Menu,
  X,
  ArrowUpRight,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConsentGate } from "@/components/consent-gate";
import { useTheme } from "@/lib/theme";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/hooks";

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: string;
};

const navItems: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ai-viva", icon: BrainCircuit, label: "Mock Viva" },
  { to: "/ai-presentation", icon: MonitorSmartphone, label: "Presentation" },
  { to: "/pitch-drill", icon: Timer, label: "Pitch Drill" },
  { to: "/advanced/sentiment-analysis", icon: Video, label: "Live Coach", badge: "2" },
  { to: "/readiness", icon: Gauge, label: "Readiness" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/teams", icon: Users, label: "Teams" },
  { to: "/profile", icon: Settings, label: "Settings" },
];

export function AppShell({
  children,
  wide = false,
  hideTopBar = false,
  fitViewport = false,
}: {
  children: ReactNode;
  wide?: boolean;
  hideTopBar?: boolean;
  fitViewport?: boolean;
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
  return (
    <div
      className={`relative bg-background overflow-x-hidden ${
        fitViewport ? "min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden" : "min-h-screen"
      }`}
    >
      {/* Atmospheric ambient light mesh using exact 4-color swatch */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-[#DF6D41]/14 blur-[130px] dark:bg-[#DF6D41]/18" />
        <div className="absolute top-[30%] -left-32 h-[500px] w-[500px] rounded-full bg-[#8DA6CC]/16 blur-[140px] dark:bg-[#8DA6CC]/18" />
        <div className="absolute top-[60%] -right-20 h-[450px] w-[450px] rounded-full bg-[#AAA648]/12 blur-[130px] dark:bg-[#AAA648]/15" />
        <div className="absolute -bottom-40 left-[15%] h-[600px] w-[600px] rounded-full bg-[#F7D89A]/15 blur-[150px] dark:bg-[#F7D89A]/12" />
      </div>
      <div
        className={`relative z-10 flex w-full gap-3 sm:gap-4 lg:gap-4 p-2.5 sm:p-3.5 lg:p-3.5 ${
          fitViewport ? "lg:h-screen lg:max-h-screen lg:overflow-hidden" : ""
        }`}
      >
        <Sidebar fitViewport={fitViewport} />
        <main
          className={`min-w-0 flex-1 pb-20 lg:pb-0 ${
            fitViewport
              ? "lg:h-full lg:max-h-full lg:overflow-hidden flex flex-col space-y-0"
              : "space-y-4"
          }`}
        >
          {!hideTopBar && <TopBar onOpenMenu={() => setDrawerOpen(true)} />}
          {children}
        </main>
      </div>
      <MobileNav onOpenMenu={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ConsentGate />
    </div>
  );
}

function Sidebar({ fitViewport = false }: { fitViewport?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";

  return (
    <aside
      className={`hidden w-[205px] xl:w-[215px] shrink-0 flex-col justify-between overflow-y-auto rounded-3xl bg-card/85 backdrop-blur-2xl border border-white/40 dark:border-white/10 p-3 shadow-[var(--shadow-glass)] lg:flex ${
        fitViewport ? "h-full max-h-full sticky top-0" : "sticky top-5 h-[calc(100vh-2.5rem)]"
      }`}
    >
      <div className="flex flex-col gap-3.5">
        {/* Brand Logo */}
        <Link to="/" aria-label="Home" className="flex items-center gap-2.5 px-2 pt-0.5">
          <img
            src="/logo.jpeg"
            alt="VivAI Logo"
            className="h-8 w-8 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-border/40"
          />
          <span className="text-base font-bold tracking-tight text-foreground">VivAI</span>
        </Link>

        {/* Clean Flat Navigation Items matching ref */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold ${
                      active ? "bg-primary-foreground text-primary" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <div className="mt-2 pt-2 border-t border-border/40 flex flex-col gap-1">
              <Link
                to="/faculty"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  isActive("/faculty")
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <ClipboardCheck className="h-4 w-4 shrink-0" />
                <span>Faculty</span>
              </Link>
              <Link
                to="/admin"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  isActive("/admin")
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <span>Institution</span>
              </Link>
            </div>
          )}
        </nav>
      </div>

      {/* Bottom Area: Promo Card + Sign Out */}
      <div className="flex flex-col gap-3">
        {/* Rounded Promo/Download Card with Canyon & Buttercream gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#DF6D41]/15 via-[#F7D89A]/10 to-transparent p-3 border border-[#8DA6CC]/30 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#DF6D41]/20 text-[#DF6D41]">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <Link
              to="/ai-viva/new"
              className="grid h-6 w-6 place-items-center rounded-full bg-[#DF6D41] text-white shadow-xs hover:scale-105 transition-transform"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-2 text-xs font-bold text-foreground">AI Viva Coach</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Practice oral defense on demand
          </p>
        </div>

        {/* Sign out */}
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary/70 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>
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
      <Link to="/" aria-label="Home" className="hidden h-9 w-9 shrink-0 place-items-center sm:grid">
        <img
          src="/logo.jpeg"
          alt="VivAI Logo"
          className="h-8 w-8 rounded-xl object-cover shadow-sm ring-1 ring-border/40"
        />
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
  const title = pageTitle(pathname);

  return (
    <header className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-card/75 backdrop-blur-2xl border border-white/40 dark:border-white/10 p-2.5 shadow-[var(--shadow-glass)] sm:p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/70 backdrop-blur-md border border-white/30 dark:border-white/10 text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden h-8 w-8 shrink-0 place-items-center sm:grid lg:hidden">
          <img
            src="/logo.jpeg"
            alt="VivAI Logo"
            className="h-8 w-8 rounded-xl object-cover shadow-sm ring-1 ring-border/40"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          to="/profile"
          className="flex items-center gap-2 rounded-full border border-white/30 dark:border-white/10 bg-secondary/70 backdrop-blur-md px-2 py-1 text-xs font-medium hover:bg-secondary/90 transition-colors"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {initials}
          </span>
          <span className="hidden max-w-[120px] truncate sm:inline">{fullName}</span>
        </Link>
      </div>
    </header>
  );
}

function MobileNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const mobileNav = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { to: "/ai-viva", icon: BrainCircuit, label: "Viva" },
    { to: "/ai-presentation", icon: MonitorSmartphone, label: "Slides" },
    { to: "/advanced/sentiment-analysis", icon: Video, label: "Coach" },
    { to: "/projects", icon: FolderKanban, label: "Projects" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-3 z-40 mx-auto flex max-w-sm items-center justify-around rounded-full border border-white/40 dark:border-white/10 bg-card/85 px-3 py-2 backdrop-blur-2xl shadow-[var(--shadow-glass)] lg:hidden">
      {mobileNav.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
              active ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={onOpenMenu}
        aria-label="More"
        className="flex flex-col items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Menu className="h-4 w-4" />
        <span>More</span>
      </button>
    </nav>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative flex w-full max-w-xs flex-1 flex-col justify-between bg-card/90 backdrop-blur-2xl border-r border-white/20 p-5 shadow-2xl">
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.jpeg"
                alt="VivAI Logo"
                className="h-8 w-8 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-border/40"
              />
              <span className="text-lg font-bold">VivAI</span>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl bg-secondary text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-primary/20 px-1 text-[9px] font-bold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <button
          onClick={() => {
            onClose();
            logout();
            navigate({ to: "/login" });
          }}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="grid h-8 w-8 place-items-center rounded-full border border-white/30 dark:border-white/10 bg-secondary/70 backdrop-blur-md text-foreground hover:bg-secondary transition-colors"
    >
      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/ai-viva")) return "Mock Viva";
  if (pathname.startsWith("/ai-presentation")) return "Presentation";
  if (pathname.startsWith("/pitch-drill")) return "Pitch Drill";
  if (pathname.startsWith("/readiness")) return "Defense Readiness";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/teams")) return "Teams";
  if (pathname.startsWith("/templates")) return "Templates";
  if (pathname.startsWith("/files")) return "Files";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/progress")) return "Progress";
  if (pathname.startsWith("/leaderboard")) return "Leaderboard";
  if (pathname.startsWith("/faculty")) return "Faculty Console";
  if (pathname.startsWith("/admin")) return "Institution";
  return "VivAI";
}

export function PageHeader({
  title,
  subtitle,
  description,
  action,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  action?: ReactNode;
}) {
  const desc = subtitle ?? description;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/40 dark:border-white/10 bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-glass)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "success" | "warning" | "destructive" | "muted";
}) {
  const tones = {
    primary: "bg-primary/15 text-primary border-primary/20",
    secondary: "bg-secondary text-secondary-foreground border-border/40",
    success: "bg-success/15 text-success border-success/20",
    warning: "bg-warning/15 text-warning border-warning/20",
    destructive: "bg-destructive/15 text-destructive border-destructive/20",
    muted: "bg-muted text-muted-foreground border-border/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
