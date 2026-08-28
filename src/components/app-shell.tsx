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
  Home,
  BarChart3,
  User,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
      <div className="flex min-h-screen items-center justify-center bg-black text-sm text-white/50 font-manrope">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#AFDDFF] animate-pulse" />
          <span>Loading workspace…</span>
        </div>
      </div>
    );
  }
  if (!ready) return null;

  if (wide) {
    return (
      <div className="flex min-h-screen flex-col bg-background font-manrope">
        <WideTopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="min-h-0 min-w-0 flex-1 pb-28 lg:pb-0">{children}</main>
        <MobileNav onOpenMenu={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <ConsentGate />
      </div>
    );
  }
  return (
    <div
      className={`relative bg-background overflow-x-hidden font-manrope ${
        fitViewport ? "min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden" : "min-h-screen"
      }`}
    >
      {/* Atmospheric ambient light mesh with ice-blue and obsidian depth */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-[#AFDDFF]/10 blur-[140px]" />
        <div className="absolute top-[30%] -left-32 h-[500px] w-[500px] rounded-full bg-[#8DA6CC]/8 blur-[150px]" />
        <div className="absolute top-[60%] -right-20 h-[450px] w-[450px] rounded-full bg-[#7CE4BA]/6 blur-[140px]" />
        <div className="absolute -bottom-40 left-[15%] h-[600px] w-[600px] rounded-full bg-[#AFDDFF]/8 blur-[160px]" />
      </div>
      <div
        className={`relative z-10 flex w-full gap-3 sm:gap-4 lg:gap-4 p-2.5 sm:p-3.5 lg:p-3.5 ${
          fitViewport ? "lg:h-screen lg:max-h-screen lg:overflow-hidden" : ""
        }`}
      >
        <Sidebar fitViewport={fitViewport} />
        <main
          className={`min-w-0 flex-1 pb-28 lg:pb-0 ${
            fitViewport
              ? "lg:h-full lg:max-full lg:overflow-hidden flex flex-col space-y-0"
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
  const isActive = (to: string) => (to === "/" ? pathname === "/" || pathname === "/dashboard" : pathname.startsWith(to));
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";

  return (
    <aside
      className={`hidden w-[210px] xl:w-[228px] shrink-0 flex-col justify-between overflow-y-auto apple-glass-card p-3 lg:flex ${
        fitViewport ? "h-full max-h-full sticky top-0" : "sticky top-4 h-[calc(100vh-2rem)]"
      }`}
    >
      <div className="flex flex-col gap-3.5">
        {/* Apple VisionOS Brand Header */}
        <Link to="/" aria-label="Home" className="flex items-center gap-2.5 px-2 pt-1 no-underline group select-none">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] flex items-center justify-center text-black font-black text-sm shadow-[0_0_16px_rgba(175,221,255,0.45),inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform group-hover:scale-105">
            V
          </div>
          <div className="flex flex-col">
            <span className="font-graphik text-sm font-bold tracking-wider text-white group-hover:text-[#AFDDFF] transition-colors leading-tight">
              VIVAI
            </span>
            <span className="text-[10px] font-mono text-white/40 tracking-tight leading-none">
              AI COMPANION
            </span>
          </div>
        </Link>

        {/* Navigation Items with Apple Squircle Pills */}
        <nav className="flex flex-col gap-1 font-manrope">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 no-underline select-none active:scale-[0.98] ${
                  active
                    ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_20px_rgba(175,221,255,0.3),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active ? "text-black" : "text-white/70 group-hover:text-[#AFDDFF]"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-black ${
                      active
                        ? "bg-black text-[#AFDDFF]"
                        : "bg-[#AFDDFF]/20 text-[#AFDDFF] border border-[#AFDDFF]/30"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-1">
              <Link
                to="/faculty"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all no-underline ${
                  isActive("/faculty")
                    ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_16px_rgba(175,221,255,0.25)]"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                }`}
              >
                <ClipboardCheck className="h-4 w-4 shrink-0" />
                <span>Faculty</span>
              </Link>
              <Link
                to="/admin"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all no-underline ${
                  isActive("/admin")
                    ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_16px_rgba(175,221,255,0.25)]"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
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
      <div className="flex flex-col gap-3 font-manrope">
        {/* Apple Frosted Promo Card */}
        <div className="relative overflow-hidden rounded-2xl bg-white/5 p-3 border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
          <div className="flex items-start justify-between">
            <div className="grid h-7 w-7 place-items-center rounded-xl bg-[#AFDDFF]/20 text-[#AFDDFF] border border-[#AFDDFF]/30">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <Link
              to="/ai-viva/new"
              className="grid h-6 w-6 place-items-center rounded-full bg-[#AFDDFF] text-black shadow-xs hover:scale-110 active:scale-95 transition-transform no-underline"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-2 text-xs font-bold text-white">AI Viva Coach</p>
          <p className="text-[10px] text-white/50 leading-tight">
            Oral defense simulations
          </p>
        </div>

        {/* Sign out */}
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-white/60 transition-all hover:bg-white/8 hover:text-white cursor-pointer active:scale-95"
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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/15 bg-black/60 px-3 sm:px-5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 border border-white/15 text-white hover:bg-white/10 active:scale-95 transition-all lg:hidden cursor-pointer"
      >
        <Menu className="h-5 w-5 text-white" />
      </button>
      <Link to="/" aria-label="Home" className="hidden h-9 w-9 shrink-0 place-items-center sm:grid group">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
          V
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm sm:text-base font-bold font-graphik text-white tracking-wide">{title}</p>
        <p className="hidden truncate text-[11px] text-white/50 sm:block">
          Full workspace · sidebar hidden for maximum focus
        </p>
      </div>
      <Link
        to="/dashboard"
        className="hidden apple-glass-btn-secondary px-3.5 py-1.5 text-xs font-semibold sm:inline-flex no-underline transition-colors"
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
    <header className="flex flex-wrap items-center justify-between gap-2.5 apple-glass-card rounded-[20px] p-2.5 sm:p-3">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 border border-white/15 text-white hover:bg-white/10 active:scale-95 transition-all lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5 text-white" />
        </button>
        <div className="hidden h-9 w-9 shrink-0 place-items-center sm:grid lg:hidden">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
            V
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm sm:text-base font-bold font-graphik text-white tracking-wide">{title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-2.5">
        <ThemeToggle />
        <Link
          to="/profile"
          className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium hover:bg-white/10 transition-colors no-underline text-white active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] text-[11px] font-bold text-black shadow-xs">
            {initials}
          </span>
          <span className="hidden max-w-[120px] truncate sm:inline font-semibold">{fullName}</span>
        </Link>
      </div>
    </header>
  );
}

function MobileNav({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    {
      id: "home",
      label: "Home",
      to: "/dashboard",
      icon: Home,
      isActive:
        pathname === "/" ||
        pathname === "/dashboard" ||
        (!pathname.startsWith("/readiness") &&
          !pathname.startsWith("/advanced") &&
          !pathname.startsWith("/profile") &&
          !pathname.startsWith("/settings")),
    },
    {
      id: "analytics",
      label: "Analytics",
      to: "/readiness",
      icon: BarChart3,
      isActive:
        pathname.startsWith("/readiness") ||
        pathname.startsWith("/advanced"),
    },
    {
      id: "account",
      label: "Account",
      to: "/profile",
      icon: User,
      isActive:
        pathname.startsWith("/profile") ||
        pathname.startsWith("/settings"),
    },
  ];

  const activeItem = navItems.find((item) => item.isActive) || navItems[0];

  return (
    <nav className="fixed inset-x-4 bottom-4 sm:bottom-5 z-40 mx-auto flex max-w-[320px] items-center justify-between rounded-full bg-[#080b11]/90 p-1.5 backdrop-blur-2xl border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_1.5px_rgba(255,255,255,0.25)] lg:hidden pb-[max(0.4rem,env(safe-area-inset-bottom))] select-none">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeItem.id;

        return (
          <Link
            key={item.id}
            to={item.to}
            className="relative flex h-[52px] flex-1 items-center justify-center rounded-full no-underline select-none active:scale-95 transition-transform duration-150 cursor-pointer"
          >
            {/* 3D Dynamic Glossy Glass Bubble / Lens */}
            {active && (
              <motion.div
                layoutId="mobile-active-lens"
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(120% 120% at 50% 0%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(0, 0, 0, 0.45) 100%)",
                  backdropFilter: "blur(20px) saturate(200%)",
                  WebkitBackdropFilter: "blur(20px) saturate(200%)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  boxShadow:
                    "inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.95), inset 0 3px 6px 0 rgba(175, 221, 255, 0.45), inset 0 -2px 3px 0 rgba(255, 120, 200, 0.3), 0 8px 24px -2px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.4)",
                }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  mass: 0.8,
                }}
              >
                {/* Prismatic Rainbow Rim Reflection */}
                <div
                  className="absolute -inset-[1px] rounded-full pointer-events-none opacity-90"
                  style={{
                    padding: "1px",
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(175,221,255,0.7) 25%, rgba(255,200,100,0.3) 50%, rgba(255,100,220,0.35) 75%, rgba(100,220,255,0.7) 100%)",
                    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
              </motion.div>
            )}

            {/* Icon + Slide-Fade Label */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <Icon
                className={`transition-all duration-200 ${
                  active
                    ? "h-5 w-5 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.75)] scale-105 stroke-[2.2]"
                    : "h-5 w-5 text-white/60 hover:text-white stroke-[1.8]"
                }`}
              />

              {/* Text label with vertical slide-fade transition ONLY on active state */}
              <AnimatePresence mode="wait">
                {active && (
                  <motion.span
                    key={item.label}
                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 3, scale: 0.9 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-0.5 text-[10px] font-bold tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)] leading-none font-graphik"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const isActive = (to: string) => (to === "/" ? pathname === "/" || pathname === "/dashboard" : pathname.startsWith(to));
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-xl transition-opacity"
        onClick={onClose}
      />
      <div className="relative flex w-full max-w-xs flex-1 flex-col justify-between bg-[#0A0E16]/90 backdrop-blur-3xl border-r border-white/15 rounded-r-[28px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.2)] overflow-y-auto">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#dcf0ff] to-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
                V
              </div>
              <div>
                <span className="font-graphik text-sm font-bold tracking-wider text-white">VIVAI // CORE</span>
                <p className="text-[10px] text-white/40 font-mono">[ BTECH.CS // 2026 ]</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 border border-white/15 text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5 font-manrope">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={`flex min-h-[48px] items-center justify-between rounded-xl px-3.5 py-3 text-xs font-semibold transition-all duration-200 no-underline active:scale-[0.98] ${
                    active
                      ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_20px_rgba(175,221,255,0.3),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                      : "text-white/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-black" : "text-white/70"}`} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-black ${
                        active ? "bg-black text-[#AFDDFF]" : "bg-[#AFDDFF]/20 text-[#AFDDFF] border border-[#AFDDFF]/30"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {isAdmin && (
              <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-1.5">
                <Link
                  to="/faculty"
                  onClick={onClose}
                  className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold transition-all no-underline active:scale-[0.98] ${
                    isActive("/faculty")
                      ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_16px_rgba(175,221,255,0.3)]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <ClipboardCheck className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Faculty Console</span>
                </Link>
                <Link
                  to="/admin"
                  onClick={onClose}
                  className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold transition-all no-underline active:scale-[0.98] ${
                    isActive("/admin")
                      ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_16px_rgba(175,221,255,0.3)]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Institution Admin</span>
                </Link>
              </div>
            )}
          </nav>
        </div>

        {/* Drawer Footer */}
        <div className="pt-4 border-t border-white/10">
          <button
            onClick={() => {
              onClose();
              logout();
              navigate({ to: "/login" });
            }}
            className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-medium text-white/50 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
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
      className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
    >
      {theme === "dark" ? <Sun className="h-4 w-4 text-white" /> : <Moon className="h-4 w-4 text-white" />}
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
