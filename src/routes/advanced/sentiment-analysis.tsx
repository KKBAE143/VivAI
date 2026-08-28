import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Mic,
  Briefcase,
  BriefcaseBusiness,
  GraduationCap,
  Presentation,
  Users,
  Rocket,
  Podcast,
  MessagesSquare,
  Code2,
  FileText,
  Handshake,
  Clock3,
  Workflow,
  MessageCircle,
  Scale,
  BadgeIndianRupee,
  Megaphone,
  PanelTop,
  Loader2,
  ArrowLeft,
  Search,
  Check,
  Sparkles,
  Camera,
  Eye,
  Sliders,
  X,
  Play,
  Languages,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useRequireAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { LIVE_LANGUAGES } from "@/lib/languages";
import { LiveSessionRunner } from "@/components/live/live-session-runner";
import { SessionReport } from "@/components/reports/session-report";
import { usePresentationSession } from "@/lib/hooks";
import { useScenarioCatalog } from "@/lib/hooks-features";
import type { Scenario } from "@/lib/types";
import type { SessionReport as SessionReportData } from "@/lib/types";

export const Route = createFileRoute("/advanced/sentiment-analysis")({
  head: () => ({ meta: [{ title: "AI Communication Coach — VivAI" }] }),
  component: CommunicationCoach,
});

const SCENARIO_ICONS: Record<string, typeof Mic> = {
  Briefcase,
  BriefcaseBusiness,
  GraduationCap,
  Presentation,
  Users,
  Rocket,
  Podcast,
  MessagesSquare,
  Code2,
  FileText,
  Handshake,
  Clock3,
  Workflow,
  MessageCircle,
  Scale,
  BadgeIndianRupee,
  Megaphone,
  PanelTop,
  Mic,
};

function ScenarioIcon({ scenario, className }: { scenario: Scenario; className?: string }) {
  const Icon = SCENARIO_ICONS[scenario.icon] ?? Mic;
  return <Icon className={className ?? "h-5 w-5"} />;
}

type Phase = "pick" | "live" | "report";

const POPULAR_LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish",
  "Telugu",
  "Tamil",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Marathi",
  "Gujarati",
];

function CommunicationCoach() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const [phase, setPhase] = useState<Phase>("pick");
  const [scenarioId, setScenarioId] = useState<string>("hr_interview");
  const [language, setLanguage] = useState<string>("English");
  const [duration, setDuration] = useState<number>(10);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const scenariosQuery = useScenarioCatalog();
  const scenarios = scenariosQuery.data ?? [];
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0] ?? null;

  const categories = useMemo(() => {
    const set = new Set<string>();
    scenarios.forEach((s) => s.category && set.add(s.category));
    return ["All", ...Array.from(set)];
  }, [scenarios]);

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((s) => {
      const matchesSearch =
        !searchQuery.trim() ||
        s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.category?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" || s.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [scenarios, searchQuery, selectedCategory]);

  const scenarioGroups = useMemo(() => {
    return filteredScenarios.reduce<Record<string, Scenario[]>>((groups, item) => {
      (groups[item.category] ??= []).push(item);
      return groups;
    }, {});
  }, [filteredScenarios]);

  const startSession = async (customLanguage?: string, customDuration?: number) => {
    setError("");
    setStarting(true);
    const effectiveLang = customLanguage ?? language;
    const effectiveDur = customDuration ?? (scenario?.default_duration_min || 10);
    try {
      if (!scenario) {
        setError("The practice catalog is still loading. Please try again in a moment.");
        return;
      }
      const session = await api<{ id: string }>("/api/presentation/sessions", {
        body: {
          session_type: "Coach",
          scenario_id: scenario.id,
          subject: scenario.label,
          duration_minutes: effectiveDur,
        },
      });
      setSessionId(session.id);
      setIsModalOpen(false);
      setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const handleSelectScenario = (s: Scenario) => {
    setScenarioId(s.id);
    if (s.default_duration_min) setDuration(s.default_duration_min);
    setIsModalOpen(true);
  };

  if (!authLoading && !ready) return null;

  // ---------- Live phase: reuse the shared real-time engine ----------
  if (phase === "live" && sessionId) {
    return (
      <div className="min-h-screen bg-[#05070a]">
        <LiveSessionRunner
          mode="coach"
          sessionId={sessionId}
          subject={scenario?.label ?? "Communication practice"}
          title={`${scenario?.label ?? "Communication"} — Communication Coach`}
          subtitle="Speak naturally to the camera — your AI coach is watching posture, tone, and delivery live."
          defaultLanguage={language}
          showPersona
          sources={["camera"]}
          onEnded={() => setPhase("report")}
        />
      </div>
    );
  }

  // ---------- Report phase ----------
  if (phase === "report" && sessionId) {
    return <CoachReport sessionId={sessionId} onDone={() => resetToPick()} />;
  }

  function resetToPick() {
    setSessionId(null);
    setPhase("pick");
  }

  // ---------- Scenario picker ----------
  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Integrated Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-graphik">
                AI Communication Coach
              </h1>
              <span className="apple-pill-badge py-0.5 px-2 text-[10px]">
                VISION & VOICE
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick a role-play scenario and practice live with real-time camera, eye contact & vocal pacing feedback.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Header Language Switcher */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-black/5 dark:bg-white/5 px-3 py-1.5 backdrop-blur-xl">
              <Languages className="h-4 w-4 text-primary" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
              >
                {LIVE_LANGUAGES.map((l) => (
                  <option key={l} value={l} className="bg-card text-foreground">
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => scenario && handleSelectScenario(scenario)}
              disabled={starting || !scenario}
              className="apple-glass-btn-primary inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {starting ? "Starting…" : `Start ${scenario?.label ?? "Practice"}`}
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="apple-glass-card p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0 relative">
          <div className="overflow-y-auto pr-1 flex-1 pb-24 sm:pb-20">
            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pb-3 border-b border-border">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search scenarios (e.g. HR Interview, Salary, Pitch, Viva)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[38px] rounded-xl border border-border bg-card pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[32px] shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "border border-border bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {scenariosQuery.isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground font-mono">Loading communication scenarios catalog…</span>
              </div>
            ) : filteredScenarios.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <p className="text-sm font-semibold">No scenarios match your search.</p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("All");
                  }}
                  className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                {Object.entries(scenarioGroups).map(([category, items]) => (
                  <section key={category}>
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                        [ {category} ]
                      </h4>
                      <span className="text-[10px] text-muted-foreground font-mono">{items.length} options</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((item) => {
                        const active = scenario?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectScenario(item)}
                            className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all cursor-pointer active:scale-[0.98] ${
                              active
                                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                                : "border-border bg-card hover:border-primary/40 hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                                    active
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                                  }`}
                                >
                                  <ScenarioIcon scenario={item} className="h-5 w-5" />
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {item.default_duration_min && (
                                    <span className="rounded-md border border-border bg-black/5 dark:bg-black/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                                      {item.default_duration_min}m
                                    </span>
                                  )}
                                  {active && (
                                    <span className="rounded-md bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-mono font-bold">
                                      SELECTED
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 font-bold text-sm text-foreground font-graphik group-hover:text-primary transition-colors">
                                {item.label}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            </div>

                            {/* Direct Launch Strip */}
                            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                              <span className="text-[11px] font-mono text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
                                <Camera className="h-3 w-3 text-primary" /> AI Camera Feedback
                              </span>
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                                  active
                                    ? "bg-primary text-primary-foreground"
                                    : "text-primary bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground"
                                }`}
                              >
                                Configure & Start →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {error && <p className="mt-2 text-xs font-mono text-rose-400">{error}</p>}

          {/* Sticky Floating Cyber Cockpit Launch Dock */}
          {scenario && (
            <div className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-4 z-20">
              <div className="rounded-2xl border border-[#AFDDFF]/40 bg-[#0A0E16]/95 backdrop-blur-2xl p-3 sm:p-3.5 shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.4)]">
                    <ScenarioIcon scenario={scenario} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-white font-graphik truncate">
                        {scenario.label}
                      </span>
                      <span className="hidden sm:inline-block rounded bg-[#AFDDFF]/15 border border-[#AFDDFF]/30 px-1.5 py-0.2 text-[10px] font-mono text-[#AFDDFF]">
                        {duration} MIN
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-white/50 font-mono truncate">
                      <span>Language: <strong className="text-[#AFDDFF]">{language}</strong></span>
                      <span>·</span>
                      <button
                        onClick={() => setIsModalOpen(true)}
                        className="text-[#AFDDFF] hover:underline cursor-pointer"
                      >
                        Change settings
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-2.5 ml-auto">
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="min-h-[40px] px-3 sm:px-4 rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Sliders className="h-3.5 w-3.5 text-[#AFDDFF]" />
                    <span className="hidden xs:inline">Configure</span>
                  </button>

                  <button
                    disabled={starting}
                    onClick={() => void startSession()}
                    className="min-h-[42px] px-5 sm:px-6 rounded-xl bg-[#AFDDFF] text-xs sm:text-sm font-bold text-black shadow-[0_0_18px_rgba(175,221,255,0.35)] hover:bg-[#c8e8ff] active:scale-95 disabled:opacity-50 transition-all cursor-pointer uppercase tracking-wider flex items-center gap-2"
                  >
                    {starting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>{starting ? "Starting…" : "Start Practice Now →"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Interactive Scenario Launch Modal */}
        {isModalOpen && scenario && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div
              className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-[#0A0E16] p-5 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto font-manrope"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Modal Header */}
              <div className="flex items-start gap-3.5 pr-8">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#AFDDFF] text-black shadow-[0_0_20px_rgba(175,221,255,0.35)]">
                  <ScenarioIcon scenario={scenario} className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#AFDDFF]/15 border border-[#AFDDFF]/30 px-2.5 py-0.5 text-[10px] font-mono font-bold text-[#AFDDFF]">
                      {scenario.category}
                    </span>
                    <span className="text-[10px] font-mono text-white/50">
                      {duration} MIN
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg sm:text-xl font-bold tracking-tight text-white font-graphik">
                    {scenario.label}
                  </h2>
                  <p className="mt-1 text-xs text-white/60 leading-relaxed">
                    {scenario.description}
                  </p>
                </div>
              </div>

              {/* Language Selection Grid */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    [ 1. SELECT SPOKEN LANGUAGE ]
                  </span>
                  <span className="text-[11px] text-[#AFDDFF] font-mono">Current: {language}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {POPULAR_LANGUAGES.map((l) => {
                    const isSelected = language === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLanguage(l)}
                        className={`min-h-[38px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? "bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.3)]"
                            : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>{l}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-black" />}
                      </button>
                    );
                  })}
                </div>

                {/* More languages select */}
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="text-[11px] text-white/40 font-mono">Other dialects:</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="rounded-lg border border-white/10 bg-black/60 px-2.5 py-1 text-xs text-white font-mono focus:border-[#AFDDFF] focus:outline-none"
                  >
                    {LIVE_LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-[#0A0E16] text-white">
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duration Options */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <span className="block mb-2.5 text-xs font-bold text-white uppercase tracking-wider font-mono">
                  [ 2. DRILL DURATION ]
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { m: 3, l: "3 min · Express" },
                    { m: 5, l: "5 min · Standard" },
                    { m: 10, l: "10 min · Deep Mock" },
                    { m: 15, l: "15 min · Panel Viva" },
                  ].map((d) => (
                    <button
                      key={d.m}
                      type="button"
                      onClick={() => setDuration(d.m)}
                      className={`min-h-[36px] rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                        duration === d.m
                          ? "bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.3)]"
                          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Coaching Telemetry Preview */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <span className="block text-[11px] font-mono font-bold text-[#AFDDFF] mb-1.5">
                  ✦ REAL-TIME COACHING TELEMETRY ACTIVE
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-black/40 p-2 border border-white/5">
                    <Eye className="h-4 w-4 text-[#AFDDFF] mx-auto mb-1" />
                    <span className="block text-[10px] text-white/70 font-bold">Eye Contact</span>
                    <span className="text-[9px] text-white/40 font-mono">Camera tracking</span>
                  </div>
                  <div className="rounded-xl bg-black/40 p-2 border border-white/5">
                    <Mic className="h-4 w-4 text-[#AFDDFF] mx-auto mb-1" />
                    <span className="block text-[10px] text-white/70 font-bold">Vocal Pitch & Pace</span>
                    <span className="text-[9px] text-white/40 font-mono">Real-time analysis</span>
                  </div>
                  <div className="rounded-xl bg-black/40 p-2 border border-white/5">
                    <Sparkles className="h-4 w-4 text-[#AFDDFF] mx-auto mb-1" />
                    <span className="block text-[10px] text-white/70 font-bold">Adaptive AI</span>
                    <span className="text-[9px] text-white/40 font-mono">Live role-play</span>
                  </div>
                </div>
              </div>

              {error && <p className="mt-3 text-xs font-mono text-rose-400">{error}</p>}

              {/* Modal Actions */}
              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={starting}
                  type="button"
                  onClick={() => void startSession(language, duration)}
                  className="min-h-[46px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#AFDDFF] px-6 py-2 text-xs sm:text-sm font-bold text-black shadow-[0_0_20px_rgba(175,221,255,0.35)] hover:bg-[#c8e8ff] active:scale-95 disabled:opacity-50 transition-all cursor-pointer uppercase tracking-wider"
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                  {starting ? "Launching Coach…" : "Launch Live Coaching Session →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Meter({ label, value }: { label: string; value: number | null | undefined }) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)));
  const tone = v < 45 ? "bg-rose-500" : v < 70 ? "bg-amber-400" : "bg-[#7CE4BA]";
  return (
    <div>
      <div className="flex justify-between text-xs font-mono">
        <span className="text-white/60">{label}</span>
        <span className="font-bold text-white">{value == null ? "—" : `${v}%`}</span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

interface CoachState {
  subject?: string | null;
  report?: {
    coach_metrics?: Record<string, number>;
    recommendations?: string[];
    strengths?: string[];
    weaknesses?: string[];
  };
}

function CoachReport({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { data: session, isLoading } = usePresentationSession(sessionId);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#05070a] text-xs font-mono text-white/60">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#AFDDFF]" />
          Preparing your AI communication telemetry report…
        </div>
      </div>
    );
  }

  const state = (session?.topic_scores as CoachState | undefined) ?? {};
  const scenario = state.subject ?? "Communication";
  const report = state.report ?? {};
  const metrics = report.coach_metrics ?? {};
  const recommendations = report.recommendations ?? [];
  const strengths = report.strengths ?? [];
  const weaknesses = report.weaknesses ?? [];
  const structuredReport = session?.report as SessionReportData | null | undefined;

  return (
    <div className="min-h-screen bg-[#05070a] text-white font-manrope">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0A0E16]/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-bold text-white font-graphik">{scenario} — Coaching Report</div>
            <div className="text-xs text-[#AFDDFF] font-mono">[ SESSION_TELEMETRY ]</div>
          </div>
          <button
            onClick={onDone}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Practice Another Scenario
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        {structuredReport && <SessionReport report={structuredReport} />}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Overall Score", session?.overall_score],
            ["Confidence", metrics.confidence ?? session?.confidence_score],
            ["Communication", metrics.communication],
            ["Clarity", metrics.clarity ?? session?.clarity_score],
          ].map(([label, val]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-card/85 p-4 text-center backdrop-blur-2xl shadow-[var(--shadow-glass)]"
            >
              <div className="text-2xl sm:text-3xl font-bold font-graphik text-white">
                {val == null ? "—" : `${val}%`}
              </div>
              <div className="mt-1 text-xs text-white/50 font-mono">{String(label)}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/85 p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono mb-4">
            [ DELIVERY_BREAKDOWN ]
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter label="Confidence & Eye Contact" value={metrics.confidence} />
            <Meter label="Communication & Articulation" value={metrics.communication} />
            <Meter label="Clarity & Structure" value={metrics.clarity} />
            <Meter label="Audience Engagement" value={metrics.engagement} />
          </div>
        </div>

        {Boolean(session?.feedback_summary) && (
          <div className="apple-glass-card p-5">
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-graphik">
              AI COACH SUMMARY
            </h3>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-white/80">
              {String(session?.feedback_summary)}
            </p>
          </div>
        )}

        {(strengths.length > 0 || weaknesses.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {strengths.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-2xl">
                <h3 className="text-xs sm:text-sm font-bold text-[#7CE4BA] uppercase tracking-wider font-mono">
                  [ STRENGTHS_NOTED ]
                </h3>
                <ul className="mt-3 space-y-2 text-xs text-white/80">
                  {strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#7CE4BA] font-bold">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur-2xl">
                <h3 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider font-mono">
                  [ AREAS_TO_REFINE ]
                </h3>
                <ul className="mt-3 space-y-2 text-xs text-white/80">
                  {weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold">!</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-card/85 p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
              [ ACTIONABLE_NEXT_STEPS ]
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-white/80">
              {recommendations.map((r, i) => (
                <li key={i} className="rounded-xl border border-white/5 bg-white/5 p-3 flex items-start gap-2.5">
                  <span className="text-[#AFDDFF] font-bold">✦</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
