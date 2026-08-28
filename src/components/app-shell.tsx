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
      className={`relative bg-background text-foreground overflow-x-hidden font-manrope transition-colors duration-200 ${
        fitViewport ? "min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden" : "min-h-screen"
      }`}
    >
      {/* Atmospheric ambient light mesh with ice-blue and obsidian depth */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-blue-500/10 dark:bg-[#AFDDFF]/10 blur-[140px]" />
        <div className="absolute top-[30%] -left-32 h-[500px] w-[500px] rounded-full bg-indigo-500/8 dark:bg-[#8DA6CC]/8 blur-[150px]" />
        <div className="absolute top-[60%] -right-20 h-[450px] w-[450px] rounded-full bg-emerald-500/8 dark:bg-[#7CE4BA]/6 blur-[140px]" />
        <div className="absolute -bottom-40 left-[15%] h-[600px] w-[600px] rounded-full bg-sky-500/10 dark:bg-[#AFDDFF]/8 blur-[160px]" />
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
  const { theme, toggle } = useTheme();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const isActive = (to: string) =>
    to === "/" ? pathname === "/" || pathname === "/dashboard" : pathname.startsWith(to);
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";

  return (
    <aside
      className={`hidden w-[210px] xl:w-[228px] shrink-0 flex-col justify-between overflow-y-auto apple-glass-card p-3 lg:flex ${
        fitViewport ? "h-full max-h-full sticky top-0" : "sticky top-4 h-[calc(100vh-2rem)]"
      }`}
    >
      <div className="flex flex-col gap-3.5">
        {/* Apple VisionOS Brand Header */}
        <Link
          to="/"
          aria-label="Home"
          className="flex items-center gap-2.5 px-2 pt-1 no-underline group select-none"
        >
          <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#0071e3] to-[#005bb5] dark:from-[#dcf0ff] dark:to-[#AFDDFF] flex items-center justify-center text-white dark:text-black font-black text-sm shadow-[0_2px_10px_rgba(0,113,227,0.3)] dark:shadow-[0_0_16px_rgba(175,221,255,0.45)] transition-transform group-hover:scale-105">
            V
          </div>
          <div className="flex flex-col">
            <span className="font-graphik text-sm font-bold tracking-wider text-foreground group-hover:text-primary transition-colors leading-tight">
              VIVAI
            </span>
            <span className="text-[10px] font-mono text-muted-foreground tracking-tight leading-none">
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
                    ? "bg-[#0071e3] text-white shadow-[0_4px_12px_rgba(0,113,227,0.35)] dark:bg-[#AFDDFF] dark:text-black font-bold dark:shadow-[0_0_20px_rgba(175,221,255,0.3),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                    : "text-foreground/75 hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active
                        ? "text-white dark:text-black"
                        : "text-muted-foreground group-hover:text-primary"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-black ${
                      active
                        ? "bg-white text-[#0071e3] dark:bg-black dark:text-[#AFDDFF]"
                        : "bg-primary/15 text-primary border border-primary/25"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <div className="mt-2 pt-2 border-t border-border flex flex-col gap-1">
              <Link
                to="/faculty"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all no-underline ${
                  isActive("/faculty")
                    ? "bg-[#0071e3] text-white shadow-md dark:bg-[#AFDDFF] dark:text-black font-bold dark:shadow-[0_0_16px_rgba(175,221,255,0.25)]"
                    : "text-foreground/75 hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground"
                }`}
              >
                <ClipboardCheck className="h-4 w-4 shrink-0" />
                <span>Faculty</span>
              </Link>
              <Link
                to="/admin"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all no-underline ${
                  isActive("/admin")
                    ? "bg-[#0071e3] text-white shadow-md dark:bg-[#AFDDFF] dark:text-black font-bold dark:shadow-[0_0_16px_rgba(175,221,255,0.25)]"
                    : "text-foreground/75 hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground"
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <span>Institution</span>
              </Link>
            </div>
          )}
        </nav>
      </div>

      {/* Bottom Area: Promo Card + Theme Switcher + Sign Out */}
      <div className="flex flex-col gap-2 font-manrope">
        {/* Apple Frosted Promo Card */}
        <div className="relative overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5 p-3 border border-border shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
          <div className="flex items-start justify-between">
            <div className="grid h-7 w-7 place-items-center rounded-xl bg-primary/15 text-primary border border-primary/25">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <Link
              to="/ai-viva/new"
              className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground dark:bg-[#AFDDFF] dark:text-black shadow-xs hover:scale-110 active:scale-95 transition-transform no-underline"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-2 text-xs font-bold text-foreground">AI Viva Coach</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Oral defense simulations
          </p>
        </div>

        {/* Sidebar Theme Switcher Button */}
        <button
          onClick={toggle}
          aria-label="Toggle theme mode"
          className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-black/5 dark:hover:bg-white/8 cursor-pointer active:scale-95 border border-border/60 bg-black/5 dark:bg-white/5"
        >
          <div className="flex items-center gap-2.5">
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            ) : (
              <Moon className="h-4 w-4 text-primary" />
            )}
            <span className="font-semibold">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">{theme}</span>
        </button>

        {/* Sign out */}
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground cursor-pointer active:scale-95"
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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-3 sm:px-5 backdrop-blur-2xl shadow-xs">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all lg:hidden cursor-pointer"
      >
        <Menu className="h-5 w-5 text-foreground" />
      </button>
      <Link
        to="/"
        aria-label="Home"
        className="hidden h-9 w-9 shrink-0 place-items-center sm:grid group"
      >
        <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#0071e3] to-[#005bb5] dark:from-[#dcf0ff] dark:to-[#AFDDFF] flex items-center justify-center text-white dark:text-black font-black text-xs shadow-xs">
          V
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm sm:text-base font-bold font-graphik text-foreground tracking-wide">
          {title}
        </p>
        <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/5 dark:bg-white/5 border border-border text-foreground hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>
        <div className="hidden h-9 w-9 shrink-0 place-items-center sm:grid lg:hidden">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#0071e3] to-[#005bb5] dark:from-[#dcf0ff] dark:to-[#AFDDFF] flex items-center justify-center text-white dark:text-black font-black text-xs shadow-xs">
            V
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm sm:text-base font-bold font-graphik text-foreground tracking-wide">
            {title}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-2.5">
        <ThemeToggle />
        <Link
          to="/profile"
          className="flex h-11 items-center gap-2 rounded-full border border-border bg-black/5 dark:bg-white/5 px-2.5 py-1 text-xs font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors no-underline text-foreground active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-[#0071e3] to-[#005bb5] dark:from-[#dcf0ff] dark:to-[#AFDDFF] text-[11px] font-bold text-white dark:text-black shadow-xs">
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
  const navigate = useNavigate();

  const navItems = [
    { id: "home", label: "Home", to: "/dashboard", icon: LayoutDashboard },
    { id: "viva", label: "Viva", to: "/ai-viva", icon: BrainCircuit },
    { id: "slides", label: "Slides", to: "/ai-presentation", icon: MonitorSmartphone },
    { id: "coach", label: "Coach", to: "/advanced/sentiment-analysis", icon: Video, badge: "AI" },
    { id: "projects", label: "Projects", to: "/projects", icon: FolderKanban },
    { id: "more", label: "More", to: "#more", icon: Menu, isAction: true },
  ];

  const isActive = (item: (typeof navItems)[number]) => {
    if (item.isAction) return false;
    if (item.to === "/dashboard") return pathname === "/" || pathname === "/dashboard";
    return pathname.startsWith(item.to);
  };

  const activeIndex = Math.max(
    0,
    navItems.findIndex((item) => isActive(item)),
  );

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lensStyle, setLensStyle] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
  }>({
    left: 4,
    width: 54,
    top: 4,
    height: 48,
  });

  const containerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const isPointerDownRef = useRef(false);
  const startXRef = useRef(0);
  const hasMovedRef = useRef(false);

  const currentIndex = dragIndex !== null ? dragIndex : activeIndex;

  const updateLensToItem = useCallback((idx: number) => {
    const el = itemRefs.current[idx];
    const container = containerRef.current;
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setLensStyle({
        left: elRect.left - containerRect.left,
        width: elRect.width,
        top: elRect.top - containerRect.top,
        height: elRect.height,
      });
    }
  }, []);

  useEffect(() => {
    if (!isDragging) {
      updateLensToItem(activeIndex);
    }
  }, [activeIndex, isDragging, updateLensToItem]);

  useEffect(() => {
    const handleResize = () => {
      updateLensToItem(currentIndex);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentIndex, updateLensToItem]);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    isPointerDownRef.current = true;
    startXRef.current = e.clientX;
    hasMovedRef.current = false;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore pointer capture errors if unsupported
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPointerDownRef.current) return;
    const dist = Math.abs(e.clientX - startXRef.current);
    if (dist > 4) {
      hasMovedRef.current = true;
      setIsDragging(true);
    }

    if (hasMovedRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const targetWidth = rect.width / navItems.length;
      const hoveredIdx = Math.max(
        0,
        Math.min(navItems.length - 1, Math.floor(relativeX / targetWidth)),
      );

      const lensW = lensStyle.width || targetWidth;
      const freeLeft = Math.max(2, Math.min(rect.width - lensW - 2, relativeX - lensW / 2));
      setLensStyle((prev) => ({ ...prev, left: freeLeft }));

      if (hoveredIdx !== dragIndex) {
        setDragIndex(hoveredIdx);
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(8);
          } catch {
            // Ignore vibration error on unsupported platforms
          }
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    if (hasMovedRef.current && dragIndex !== null) {
      const selectedItem = navItems[dragIndex];
      if (selectedItem) {
        if (selectedItem.isAction) {
          onOpenMenu?.();
        } else if (selectedItem.to) {
          navigate({ to: selectedItem.to });
        }
      }
      updateLensToItem(dragIndex);
    } else {
      updateLensToItem(activeIndex);
    }

    setIsDragging(false);
    setDragIndex(null);
    hasMovedRef.current = false;
  };

  return (
    <nav
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="fixed inset-x-3 bottom-3 sm:bottom-4 z-40 mx-auto flex max-w-[420px] items-center justify-between rounded-full bg-white/80 dark:bg-[#080b11]/90 p-1.5 backdrop-blur-2xl border border-black/10 dark:border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.12),inset_0_1px_1.5px_rgba(255,255,255,0.9)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_1.5px_rgba(255,255,255,0.25)] lg:hidden pb-[max(0.4rem,env(safe-area-inset-bottom))] touch-none select-none"
    >
      {/* 3D Dynamic Glossy Glass Bubble / Lens with Spring Glide and Elastic Drag Squish */}
      <div
        className="absolute rounded-full pointer-events-none z-0"
        style={{
          left: `${lensStyle.left}px`,
          top: `${lensStyle.top}px`,
          width: `${lensStyle.width}px`,
          height: `${lensStyle.height}px`,
          background:
            "radial-gradient(120% 120% at 50% 0%, rgba(255, 255, 255, 0.95) 0%, rgba(240, 246, 255, 0.85) 100%)",
          backdropFilter: "blur(20px) saturate(200%)",
          WebkitBackdropFilter: "blur(20px) saturate(200%)",
          border: "1px solid rgba(0, 113, 227, 0.25)",
          boxShadow:
            "inset 0 1.5px 2px 0 rgba(255, 255, 255, 1), 0 4px 14px rgba(0, 113, 227, 0.15)",
          transform: isDragging ? "scale(1.08, 0.94)" : "scale(1)",
          transition: isDragging
            ? "transform 0.12s ease-out"
            : "left 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25), width 0.3s ease, transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.25)",
        }}
      >
        {/* Prismatic Rainbow Rim Reflection for dark mode */}
        <div
          className="absolute -inset-[1px] rounded-full pointer-events-none opacity-0 dark:opacity-90 transition-opacity"
          style={{
            padding: "1px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(175,221,255,0.7) 25%, rgba(255,200,100,0.3) 50%, rgba(255,100,220,0.35) 75%, rgba(100,220,255,0.7) 100%)",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      </div>

      {navItems.map((item, idx) => {
        const Icon = item.icon;
        const active = currentIndex === idx;

        if (item.isAction) {
          return (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              onClick={() => {
                if (!hasMovedRef.current) onOpenMenu?.();
              }}
              aria-label={item.label}
              className="relative flex h-[50px] flex-1 flex-col items-center justify-center rounded-full px-1 py-1 text-[11px] font-medium transition-all duration-200 select-none cursor-pointer bg-transparent border-0 z-10 active:scale-95"
            >
              <div className="flex flex-col items-center justify-center">
                <Menu
                  className={`transition-all duration-200 ${
                    active
                      ? "h-5 w-5 text-[#0071e3] dark:text-white drop-shadow-[0_0_10px_rgba(0,113,227,0.4)] dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] scale-105 stroke-[2.2]"
                      : "h-5 w-5 text-foreground/60 hover:text-foreground stroke-[1.8]"
                  }`}
                />

                {/* Vertical slide-fade text label ONLY visible in active state */}
                <AnimatePresence mode="wait">
                  {active && (
                    <motion.span
                      key={item.label}
                      initial={{ opacity: 0, y: 4, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 3, scale: 0.9 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="mt-0.5 text-[10px] font-bold tracking-tight text-[#0071e3] dark:text-white drop-shadow-xs leading-none font-graphik"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </button>
          );
        }

        return (
          <Link
            key={item.id}
            to={item.to}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            onClick={(e) => {
              if (hasMovedRef.current) e.preventDefault();
            }}
            className="relative flex h-[50px] flex-1 flex-col items-center justify-center rounded-full px-1 py-1 text-[11px] font-medium transition-all duration-200 no-underline select-none z-10 active:scale-95 cursor-pointer"
          >
            <div className="flex flex-col items-center justify-center">
              <div className="relative">
                <Icon
                  className={`transition-all duration-200 ${
                    active
                      ? "h-5 w-5 text-[#0071e3] dark:text-white drop-shadow-[0_0_10px_rgba(0,113,227,0.4)] dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] scale-105 stroke-[2.2]"
                      : "h-5 w-5 text-foreground/60 hover:text-foreground stroke-[1.8]"
                  }`}
                />
                {item.badge && !active && (
                  <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#0071e3] dark:bg-[#AFDDFF] px-1 text-[8px] font-black text-white dark:text-black shadow-xs">
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Vertical slide-fade text label ONLY visible in active state */}
              <AnimatePresence mode="wait">
                {active && (
                  <motion.span
                    key={item.label}
                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 3, scale: 0.9 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-0.5 text-[10px] font-bold tracking-tight text-[#0071e3] dark:text-white drop-shadow-xs leading-none font-graphik"
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
  const { theme, toggle } = useTheme();
  const { data: profile } = useProfile();
  const navigate = useNavigate();

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" || pathname === "/dashboard" : pathname.startsWith(to);
  const isAdmin = profile?.role === "admin" || profile?.role === "faculty";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-card/95 border-l border-border p-6 shadow-2xl backdrop-blur-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-b from-[#0071e3] to-[#005bb5] dark:from-[#dcf0ff] dark:to-[#AFDDFF] flex items-center justify-center text-white dark:text-black font-black text-xs shadow-xs">
                V
              </div>
              <div>
                <span className="font-graphik text-sm font-bold tracking-wider text-foreground">
                  VIVAI // CORE
                </span>
                <p className="text-[10px] text-muted-foreground font-mono">[ BTECH.CS // 2026 ]</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="grid h-10 w-10 place-items-center rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer"
            >
              <X className="h-5 w-5 text-foreground" />
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
                      ? "bg-[#0071e3] text-white shadow-md dark:bg-[#AFDDFF] dark:text-black font-bold dark:shadow-[0_0_20px_rgba(175,221,255,0.3)]"
                      : "text-foreground/75 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-white dark:text-black" : "text-muted-foreground"}`}
                    />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-black ${
                        active
                          ? "bg-white text-[#0071e3] dark:bg-black dark:text-[#AFDDFF]"
                          : "bg-primary/15 text-primary border border-primary/25"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {isAdmin && (
              <div className="mt-3 pt-3 border-t border-border flex flex-col gap-1.5">
                <Link
                  to="/faculty"
                  onClick={onClose}
                  className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-semibold transition-all no-underline active:scale-[0.98] ${
                    isActive("/faculty")
                      ? "bg-[#0071e3] text-white shadow-md dark:bg-[#AFDDFF] dark:text-black font-bold dark:shadow-[0_0_16px_rgba(175,221,255,0.3)]"
                      : "text-foreground/75 hover:bg-muted hover:text-foreground"
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
                      ? "bg-[#0071e3] text-white shadow-md dark:bg-[#AFDDFF] dark:text-black font-bold dark:shadow-[0_0_16px_rgba(175,221,255,0.3)]"
                      : "text-foreground/75 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Institution Admin</span>
                </Link>
              </div>
            )}
          </nav>
        </div>

        {/* Drawer Footer with Theme Toggle & Sign out */}
        <div className="pt-4 border-t border-border flex flex-col gap-2.5">
          {/* Drawer Theme Switcher Button */}
          <button
            onClick={toggle}
            aria-label="Toggle theme mode"
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium text-foreground bg-black/5 dark:bg-white/5 border border-border transition-all cursor-pointer active:scale-95"
          >
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              ) : (
                <Moon className="h-4 w-4 text-primary" />
              )}
              <span className="text-sm font-semibold">
                {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              </span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">{theme}</span>
          </button>

          <button
            onClick={() => {
              onClose();
              logout();
              navigate({ to: "/login" });
            }}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-2xl border border-border bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer shadow-xs"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.5)]" />
      ) : (
        <Moon className="h-4 w-4 text-foreground" />
      )}
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
