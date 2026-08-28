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
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
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
      className={`hidden w-[205px] xl:w-[220px] shrink-0 flex-col justify-between overflow-y-auto rounded-2xl bg-card/85 backdrop-blur-2xl border border-white/10 p-3 shadow-[var(--shadow-glass)] lg:flex ${
        fitViewport ? "h-full max-h-full sticky top-0" : "sticky top-5 h-[calc(100vh-2.5rem)]"
      }`}
    >
      <div className="flex flex-col gap-3.5">
        {/* Brand Logo matching Homepage */}
        <Link to="/" aria-label="Home" className="flex items-center gap-2.5 px-2 pt-1 no-underline group">
          <div className="h-7 w-7 rounded-lg bg-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
            V
          </div>
          <span className="font-graphik text-sm font-bold tracking-wider text-white group-hover:text-[#AFDDFF] transition-colors">
            VIVAI // CORE
          </span>
        </Link>

        {/* Navigation Items with Ice Blue Highlight */}
        <nav className="flex flex-col gap-1 font-manrope">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all no-underline ${
                  active
                    ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_16px_rgba(175,221,255,0.25)]"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-black" : "text-white/70 group-hover:text-[#AFDDFF] transition-colors"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold ${
                      active ? "bg-black text-[#AFDDFF]" : "bg-[#AFDDFF]/20 text-[#AFDDFF]"
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
                    : "text-white/60 hover:bg-white/5 hover:text-white"
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
                    : "text-white/60 hover:bg-white/5 hover:text-white"
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
        {/* Obsidian Glass Promo Card with Ice Blue Accent */}
        <div className="relative overflow-hidden rounded-xl bg-[#AFDDFF]/8 p-3 border border-[#AFDDFF]/20 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#AFDDFF]/15 text-[#AFDDFF]">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <Link
              to="/ai-viva/new"
              className="grid h-6 w-6 place-items-center rounded-full bg-[#AFDDFF] text-black shadow-xs hover:scale-105 transition-transform no-underline"
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
          className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs font-medium text-white/50 transition-all hover:bg-white/5 hover:text-white cursor-pointer"
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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-card/85 px-3 sm:px-5 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-95 transition-all lg:hidden cursor-pointer"
      >
        <Menu className="h-5 w-5 text-white" />
      </button>
      <Link to="/" aria-label="Home" className="hidden h-9 w-9 shrink-0 place-items-center sm:grid group">
        <div className="h-8 w-8 rounded-lg bg-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
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
        className="hidden rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 sm:inline-flex no-underline transition-colors"
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
    <header className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-card/85 backdrop-blur-2xl border border-white/10 p-2.5 sm:p-3 shadow-[var(--shadow-glass)]">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-95 transition-all lg:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5 text-white" />
        </button>
        <div className="hidden h-9 w-9 shrink-0 place-items-center sm:grid lg:hidden">
          <div className="h-8 w-8 rounded-lg bg-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
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
          className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium hover:bg-white/10 transition-colors no-underline text-white active:scale-95"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#AFDDFF] text-[11px] font-bold text-black shadow-xs">
            {initials}
          </span>
          <span className="hidden max-w-[120px] truncate sm:inline font-semibold">{fullName}</span>
        </Link>
      </div>
    </header>
  );
}

function MobileNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isActive = (to?: string) => {
    if (!to) return false;
    return to === "/" ? pathname === "/" || pathname === "/dashboard" : pathname.startsWith(to);
  };

  const mobileNav = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { to: "/ai-viva", icon: BrainCircuit, label: "Viva" },
    { to: "/ai-presentation", icon: MonitorSmartphone, label: "Slides" },
    { to: "/advanced/sentiment-analysis", icon: Video, label: "Coach", badge: "2" },
    { to: "/projects", icon: FolderKanban, label: "Projects" },
    { to: "#more", icon: Menu, label: "More", isAction: true },
  ];

  const activeIndex = Math.max(
    0,
    mobileNav.findIndex((item) => !item.isAction && isActive(item.to)),
  );

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lensStyle, setLensStyle] = useState<{ left: number; width: number; top: number; height: number }>({
    left: 4,
    width: 60,
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
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPointerDownRef.current) return;
    const dist = Math.abs(e.clientX - startXRef.current);
    if (dist > 5) {
      hasMovedRef.current = true;
      setIsDragging(true);
    }

    if (hasMovedRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const targetWidth = rect.width / mobileNav.length;
      const hoveredIdx = Math.max(0, Math.min(mobileNav.length - 1, Math.floor(relativeX / targetWidth)));

      const lensW = lensStyle.width || targetWidth;
      const freeLeft = Math.max(2, Math.min(rect.width - lensW - 2, relativeX - lensW / 2));
      setLensStyle((prev) => ({ ...prev, left: freeLeft }));

      if (hoveredIdx !== dragIndex) {
        setDragIndex(hoveredIdx);
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(8);
          } catch {}
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    if (hasMovedRef.current && dragIndex !== null) {
      const selectedItem = mobileNav[dragIndex];
      if (selectedItem) {
        if (selectedItem.isAction) {
          onOpenMenu();
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
      className="fixed inset-x-3 bottom-3 sm:bottom-4 z-40 mx-auto flex max-w-[420px] items-center justify-between rounded-full liquid-glass-bar p-1.5 lg:hidden pb-[max(0.4rem,env(safe-area-inset-bottom))] touch-none select-none"
    >
      {/* Dynamic Animated Liquid Glass Lens */}
      <div
        className="liquid-glass-lens"
        style={{
          left: `${lensStyle.left}px`,
          top: `${lensStyle.top}px`,
          width: `${lensStyle.width}px`,
          height: `${lensStyle.height}px`,
          transform: isDragging ? "scale(1.08, 0.94)" : "scale(1)",
          transition: isDragging
            ? "transform 0.12s ease-out"
            : "left 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25), width 0.3s ease, transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.25)",
        }}
      />

      {mobileNav.map((item, idx) => {
        const Icon = item.icon;
        const active = currentIndex === idx;

        if (item.isAction) {
          return (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              onClick={() => {
                if (!hasMovedRef.current) onOpenMenu();
              }}
              aria-label={item.label}
              className="relative flex min-h-[50px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1 text-[11px] font-medium transition-all duration-200 select-none cursor-pointer bg-transparent border-0 z-10"
            >
              <div className="flex flex-col items-center justify-center">
                <Menu
                  className={`h-5 w-5 transition-all duration-200 ${
                    active ? "text-[#38BDF8] scale-105" : "text-white/90"
                  }`}
                />
                <span
                  className={`mt-0.5 text-[10px] tracking-tight leading-none transition-all duration-200 ${
                    active ? "text-[#38BDF8] font-bold" : "text-white/80 font-medium"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        }

        return (
          <Link
            key={item.to}
            to={item.to}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            onClick={(e) => {
              if (hasMovedRef.current) e.preventDefault();
            }}
            className="relative flex min-h-[50px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1 text-[11px] font-medium transition-all duration-200 no-underline select-none z-10"
          >
            <div className="flex flex-col items-center justify-center">
              <div className="relative">
                <Icon
                  className={`h-5 w-5 transition-all duration-200 ${
                    active
                      ? "text-[#38BDF8] drop-shadow-[0_0_8px_rgba(56,189,248,0.6)] scale-105"
                      : "text-white/90"
                  }`}
                />
                {item.badge && !active && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff453a] px-1 text-[10px] font-black text-white shadow-[0_2px_8px_rgba(255,69,58,0.7)] ring-1 ring-black/40">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`mt-0.5 text-[10px] tracking-tight leading-none transition-all duration-200 ${
                  active ? "text-[#38BDF8] font-bold" : "text-white/80 font-medium"
                }`}
              >
                {item.label}
              </span>
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
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />
      <div className="relative flex w-full max-w-xs flex-1 flex-col justify-between bg-[#0A0E16]/95 backdrop-blur-3xl border-r border-white/10 p-5 shadow-2xl overflow-y-auto">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#AFDDFF] flex items-center justify-center text-black font-black text-xs shadow-[0_0_12px_rgba(175,221,255,0.4)]">
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
              className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
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
                  className={`flex min-h-[48px] items-center justify-between rounded-xl px-3.5 py-3 text-xs font-semibold transition-all no-underline active:scale-[0.98] ${
                    active
                      ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_16px_rgba(175,221,255,0.3)]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-black" : "text-white/70"}`} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                        active ? "bg-black text-[#AFDDFF]" : "bg-[#AFDDFF]/20 text-[#AFDDFF]"
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
