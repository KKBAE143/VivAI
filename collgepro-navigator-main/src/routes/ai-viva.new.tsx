import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mic, BookOpen, FolderKanban, BrainCircuit } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateVivaSession, useProjects } from "@/lib/hooks";

export const Route = createFileRoute("/ai-viva/new")({
  head: () => ({ meta: [{ title: "Configure Mock Viva — CollgePro Navigator" }] }),
  component: NewViva,
});

const SESSION_TYPES = [
  { value: "Subject", t: "Subject Viva", d: "For a specific exam", i: BookOpen },
  { value: "Project", t: "Project Viva", d: "Defend your project", i: FolderKanban },
  { value: "General", t: "General", d: "Technical interview", i: BrainCircuit },
] as const;

const DURATIONS = [
  { minutes: 5, label: "Quick · 5 min" },
  { minutes: 10, label: "Short · 10 min" },
  { minutes: 20, label: "Medium · 20 min" },
  { minutes: 30, label: "Deep · 30 min" },
] as const;

const FOCUS_AREAS = ["Algorithms", "Database", "Networking", "OOP", "Machine Learning"];

function NewViva() {
  useRequireAuth();
  const { data: projects } = useProjects();
  const [sessionType, setSessionType] = useState<string>("Project");
  const [duration, setDuration] = useState(20);
  const [difficulty, setDifficulty] = useState("Adaptive");
  const [projectId, setProjectId] = useState("");
  const [language, setLanguage] = useState("English");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const mutate = useCreateVivaSession();
  const navigate = useNavigate();

  const toggleFocus = (area: string) =>
    setFocusAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));

  const handleStart = async () => {
    setError("");
    try {
      const res = await mutate.mutateAsync({
        session_type: sessionType,
        duration_minutes: duration,
        difficulty,
        language,
        project_id: projectId || undefined,
        subject: focusAreas.length ? focusAreas.join(", ") : undefined,
      });
      navigate({ to: "/ai-viva/session/$id", params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    }
  };

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Link to="/ai-viva" className="grid h-9 w-9 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader title="New Mock Viva" subtitle="Configure your session and start practicing." />
      </div>
      <Card>
        <Section title="Session Type">
          <div className="grid gap-3 sm:grid-cols-3">
            {SESSION_TYPES.map((o) => {
              const I = o.i;
              const active = sessionType === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => setSessionType(o.value)}
                  className={`rounded-xl border p-4 text-left transition-colors ${active ? "border-primary bg-primary-soft" : "border-border hover:border-primary"}`}
                >
                  <I className="h-5 w-5 text-primary" />
                  <div className="mt-3 font-semibold">{o.t}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{o.d}</div>
                </button>
              );
            })}
          </div>
        </Section>
        <Section title="Duration">
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.minutes}
                onClick={() => setDuration(d.minutes)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${duration === d.minutes ? "border-primary bg-primary-soft" : "border-border"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Difficulty">
          <div className="flex flex-wrap gap-2">
            {["Easy", "Medium", "Hard", "Adaptive"].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${difficulty === d ? "bg-foreground text-background" : "bg-secondary"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Project">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm"
          >
            <option value="">No project (subject / general practice)</option>
            {(projects ?? []).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>{String(p.title)}</option>
            ))}
          </select>
        </Section>
        <Section title="Focus Areas">
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((t) => {
              const active = focusAreas.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleFocus(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-primary-soft text-accent-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  {t} {active && "×"}
                </button>
              );
            })}
          </div>
        </Section>
        <Section title="Language">
          <div className="flex gap-2">
            {["English", "Hindi", "Hinglish"].map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${language === l ? "bg-foreground text-background" : "bg-secondary"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Section>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link to="/ai-viva" className="rounded-xl bg-secondary px-4 py-3 text-sm font-medium">Cancel</Link>
          <button
            disabled={mutate.isPending}
            onClick={() => void handleStart()}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            <Mic className="h-4 w-4" /> {mutate.isPending ? "Creating…" : "Begin Mock Viva"}
          </button>
        </div>
      </Card>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}