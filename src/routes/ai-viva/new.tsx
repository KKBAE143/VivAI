import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mic, BookOpen, FolderKanban, BrainCircuit, Sparkles, Check } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateVivaSession, useProjects } from "@/lib/hooks";
import { usePersonaCatalog } from "@/lib/hooks-features";
import { LIVE_LANGUAGES } from "@/lib/languages";

export const Route = createFileRoute("/ai-viva/new")({
  head: () => ({ meta: [{ title: "Configure Mock Viva — VivAI" }] }),
  validateSearch: (search: Record<string, unknown>): { projectId?: string } => ({
    projectId: typeof search.projectId === "string" ? search.projectId : undefined,
  }),
  component: NewViva,
});

const SESSION_TYPES = [
  { value: "Subject", t: "Subject Viva", d: "For a specific exam", i: BookOpen },
  { value: "Project", t: "Project Viva", d: "Defend your project", i: FolderKanban },
  { value: "General", t: "General", d: "Technical interview", i: BrainCircuit },
] as const;

const DURATIONS = [
  { minutes: 5, label: "5m · Quick" },
  { minutes: 10, label: "10m · Short" },
  { minutes: 20, label: "20m · Standard" },
  { minutes: 30, label: "30m · Deep" },
] as const;

const SUBJECT_SUGGESTIONS = [
  "Data Structures & Algorithms",
  "DBMS",
  "Operating Systems",
  "Computer Networks",
  "OOP",
  "Machine Learning",
  "Digital Signal Processing",
  "Microprocessors",
];

const FALLBACK_PERSONAS = [
  { value: "friendly", t: "Friendly", d: "Encouraging, gentle follow-ups" },
  { value: "calm", t: "Calm", d: "Steady, low-pressure practice" },
  { value: "balanced", t: "Balanced", d: "Realistic faculty interviewer" },
  { value: "strict", t: "Strict", d: "Probing, expects precision" },
  { value: "hostile", t: "Tough Panel", d: "Skeptical, high pressure" },
] as const;

function NewViva() {
  useRequireAuth();
  const { projectId: initialProjectId } = Route.useSearch();
  const { data: projects } = useProjects();
  const personaCatalog = usePersonaCatalog();
  const personas = personaCatalog.data?.length
    ? personaCatalog.data.map((p) => ({ value: p.id, t: p.label, d: p.description }))
    : FALLBACK_PERSONAS;
  const [sessionType, setSessionType] = useState<string>("Project");
  const [duration, setDuration] = useState(20);
  const [difficulty, setDifficulty] = useState("Adaptive");
  const [persona, setPersona] = useState("balanced");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [language, setLanguage] = useState("English");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const mutate = useCreateVivaSession();
  const navigate = useNavigate();

  const addSuggestion = (s: string) =>
    setSubject((prev) => {
      const parts = prev
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.some((p) => p.toLowerCase() === s.toLowerCase())) return prev;
      return [...parts, s].join(", ");
    });

  const isProjectViva = sessionType === "Project";
  const isSubjectViva = sessionType === "Subject";
  const canStart = isProjectViva
    ? Boolean(projectId)
    : isSubjectViva
      ? Boolean(subject.trim())
      : true;

  const handleStart = async () => {
    setError("");
    if (isProjectViva && !projectId) {
      setError("Pick the project you'll defend, or switch to a Subject/General viva.");
      return;
    }
    if (isSubjectViva && !subject.trim()) {
      setError("Enter your subject, branch or the exact topics you want to be examined on.");
      return;
    }
    try {
      const res = await mutate.mutateAsync({
        session_type: sessionType,
        duration_minutes: duration,
        difficulty,
        persona,
        language,
        project_id: isProjectViva ? projectId : undefined,
        subject: !isProjectViva && subject.trim() ? subject.trim() : undefined,
      });
      navigate({ to: "/ai-viva/session/$id", params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    }
  };

  const selectedPersonaObj = personas.find((p) => p.value === persona);

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-2.5 lg:gap-3 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Compact Integrated Cyber Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card/85 px-3.5 sm:px-4 py-2.5 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
          <div className="flex items-center gap-3">
            <Link
              to="/ai-viva"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all no-underline"
              aria-label="Back to Viva Sessions"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-white font-graphik">
                  Configure Mock Viva
                </h1>
                <span className="text-[10px] sm:text-xs text-[#AFDDFF] bg-[#AFDDFF]/15 px-2 py-0.5 rounded font-mono font-medium">
                  [ PARAMETERS ]
                </span>
              </div>
              <p className="text-[11px] text-white/50 hidden sm:block">
                Set defense duration, examiner persona, difficulty and project grounding.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/ai-viva"
              className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all no-underline"
            >
              Cancel
            </Link>
            <button
              disabled={mutate.isPending || !canStart}
              onClick={() => void handleStart()}
              className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-xl bg-[#AFDDFF] px-4 py-1.5 text-xs font-bold text-black shadow-[0_0_14px_rgba(175,221,255,0.25)] hover:bg-[#c8e8ff] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition-all cursor-pointer uppercase tracking-wider"
            >
              <Mic className="h-3.5 w-3.5" />
              {mutate.isPending ? "Starting…" : "Begin Mock Viva"}
            </button>
          </div>
        </div>

        {/* Full Viewport 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 lg:gap-3 flex-1 min-h-0">
          
          {/* Left Column: Scope & Examiner (7 cols on lg, 7 cols on xl) */}
          <div className="lg:col-span-7 flex flex-col gap-2.5 lg:gap-3 min-h-0 justify-between">
            
            {/* Card 1: Session Type */}
            <div className="rounded-2xl border border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                  [ 01 · SESSION TYPE ]
                </span>
                <span className="text-[11px] text-white/40">Choose oral defense format</span>
              </div>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                {SESSION_TYPES.map((o) => {
                  const I = o.i;
                  const active = sessionType === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => setSessionType(o.value)}
                      className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer active:scale-[0.98] ${
                        active
                          ? "border-[#AFDDFF] bg-[#AFDDFF]/10 shadow-[0_0_14px_rgba(175,221,255,0.15)]"
                          : "border-white/10 bg-white/5 hover:border-white/20 text-white/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <I className={`h-4 w-4 ${active ? "text-[#AFDDFF]" : "text-white/60"}`} />
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-[#AFDDFF] animate-pulse" />}
                      </div>
                      <div className="mt-1.5 font-bold text-xs sm:text-sm text-white font-graphik">{o.t}</div>
                      <div className="mt-0.5 text-[11px] text-white/50">{o.d}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card 2: Grounding / Focus */}
            <div className="rounded-2xl border border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                  [ 02 · {isProjectViva ? "PROJECT GROUNDING" : isSubjectViva ? "SUBJECT & SYLLABUS" : "FOCUS AREA"} ]
                </span>
                <span className="text-[11px] text-white/40">
                  {isProjectViva ? "Select project codebase" : "Target topics"}
                </span>
              </div>

              {isProjectViva ? (
                <div>
                  <Select
                    value={projectId || "placeholder"}
                    onValueChange={(v) => setProjectId(v === "placeholder" ? "" : v)}
                  >
                    <SelectTrigger className="w-full min-h-[42px] rounded-xl border border-white/15 bg-black/60 px-3.5 py-2 text-xs sm:text-sm text-white focus:border-[#AFDDFF]">
                      <SelectValue placeholder="Select your project to defend…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder">
                        Select your project to defend…
                      </SelectItem>
                      {(projects ?? []).map((p) => (
                        <SelectItem key={String(p.id)} value={String(p.id)}>
                          {String(p.title)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    {(projects ?? []).length === 0 ? (
                      <p className="text-white/50">
                        You have no projects yet.{" "}
                        <Link to="/projects/new" className="font-bold text-[#AFDDFF] hover:underline">
                          Add a project
                        </Link>{" "}
                        first, or switch to Subject Viva.
                      </p>
                    ) : (
                      <p className="text-white/40">
                        The AI examiner will ask questions grounded in this project's architecture, dependencies, and code.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    rows={2}
                    placeholder={
                      isSubjectViva
                        ? "e.g. ECE — Digital Signal Processing: FIR/IIR filters, z-transform, sampling"
                        : "e.g. CSE 3rd year — DBMS and OS. Leave blank for general technical interview."
                    }
                    className="w-full resize-none rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs text-white leading-relaxed placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-white/40 mr-0.5">Quick add:</span>
                    {SUBJECT_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addSuggestion(s)}
                        className="min-h-[22px] rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70 hover:bg-white/10 hover:text-white cursor-pointer active:scale-95 transition-all"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Examiner Persona */}
            <div className="rounded-2xl border border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                  [ 03 · EXAMINER PERSONA ]
                </span>
                <span className="text-[11px] text-[#AFDDFF] font-mono">{selectedPersonaObj?.t ?? persona}</span>
              </div>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                {personas.map((p) => {
                  const active = persona === p.value;
                  return (
                    <button
                      key={p.value}
                      onClick={() => setPersona(p.value)}
                      className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer flex flex-col justify-between active:scale-[0.98] ${
                        active
                          ? "border-[#AFDDFF] bg-[#AFDDFF]/10 shadow-[0_0_14px_rgba(175,221,255,0.15)]"
                          : "border-white/10 bg-white/5 hover:border-white/20 text-white/80"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white font-graphik">{p.t}</span>
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-[#AFDDFF]" />}
                        </div>
                        <div className="mt-1 text-[10px] text-white/50 leading-snug line-clamp-2">{p.d}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Parameters, Language, Live Summary & Actions (5 cols on lg/xl) */}
          <div className="lg:col-span-5 flex flex-col gap-2.5 lg:gap-3 min-h-0 justify-between">
            
            {/* Card 4: Duration & Difficulty */}
            <div className="rounded-2xl border border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] space-y-3">
              {/* Duration */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                    [ 04 · DURATION ]
                  </span>
                  <span className="text-[11px] text-[#AFDDFF] font-mono font-bold">{duration} minutes</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.minutes}
                      onClick={() => setDuration(d.minutes)}
                      className={`min-h-[34px] rounded-xl border px-2 py-1 text-xs font-semibold transition-all cursor-pointer text-center active:scale-95 ${
                        duration === d.minutes
                          ? "border-[#AFDDFF] bg-[#AFDDFF] text-black font-bold shadow-[0_0_12px_rgba(175,221,255,0.3)]"
                          : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                    [ 05 · DIFFICULTY ]
                  </span>
                  <span className="text-[11px] text-[#AFDDFF] font-mono font-bold">{difficulty}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["Easy", "Medium", "Hard", "Adaptive"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`min-h-[34px] rounded-xl px-2 py-1 text-xs font-bold transition-all cursor-pointer text-center active:scale-95 ${
                        difficulty === d
                          ? "bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.3)]"
                          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 5: Spoken Language */}
            <div className="rounded-2xl border border-white/10 bg-card/85 p-3.5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                    [ 06 · SPOKEN LANGUAGE ]
                  </span>
                  <span className="text-[11px] text-[#AFDDFF] font-mono font-bold">{language}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1">
                  {LIVE_LANGUAGES.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={`min-h-[28px] rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer active:scale-95 ${
                        language === l
                          ? "bg-[#AFDDFF] text-black font-bold shadow-[0_0_10px_rgba(175,221,255,0.3)]"
                          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Defense Setup Summary Briefing */}
              <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-white/50 uppercase">DEFENSE CONFIGURATION</span>
                  <span className="flex items-center gap-1 text-[#AFDDFF]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#AFDDFF] animate-pulse" />
                    READY
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="text-white font-semibold">{sessionType} Viva</span>
                  <span className="text-white/30">/</span>
                  <span className="text-[#AFDDFF]">{selectedPersonaObj?.t ?? persona}</span>
                  <span className="text-white/30">/</span>
                  <span className="text-white/80">{duration}m ({difficulty})</span>
                  <span className="text-white/30">/</span>
                  <span className="text-white/60">{language}</span>
                </div>
              </div>
            </div>

            {/* Error banner if any */}
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-mono text-rose-300">
                {error}
              </div>
            )}

            {/* Card 6: Action Footer */}
            <div className="rounded-2xl border border-white/10 bg-card/85 p-3 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex items-center justify-between gap-2.5">
              <Link
                to="/ai-viva"
                className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all no-underline"
              >
                Cancel
              </Link>
              <button
                disabled={mutate.isPending || !canStart}
                onClick={() => void handleStart()}
                className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#AFDDFF] px-5 text-xs sm:text-sm font-bold text-black shadow-[0_0_16px_rgba(175,221,255,0.3)] hover:bg-[#c8e8ff] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition-all cursor-pointer uppercase tracking-wider"
              >
                <Mic className="h-4 w-4" />
                {mutate.isPending ? "Starting Session…" : "Begin Mock Viva"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
