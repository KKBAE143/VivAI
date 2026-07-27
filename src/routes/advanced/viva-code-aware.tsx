import { useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { UploadStep } from "@/components/code-aware/upload-step";
import { api } from "@/lib/api";
import { analyzeZip } from "@/lib/codeflow";
import { useProjects } from "@/lib/hooks";
import { LIVE_LANGUAGES } from "@/lib/languages";
import { usePersonaCatalog } from "@/lib/hooks-features";

export const Route = createFileRoute("/advanced/viva-code-aware")({
  head: () => ({ meta: [{ title: "Code-Aware Viva — CollgePro Navigator" }] }),
  component: CodeAwareVivaPage,
});

/**
 * Flow: pick ZIP + viva settings → local structure pass → server knowledge pack
 * → jump straight into the live 3-pane mock viva (no graph explore step).
 */
function CodeAwareVivaPage() {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const { data: personas } = usePersonaCatalog();
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("English");
  const [persona, setPersona] = useState("balanced");
  const [duration, setDuration] = useState(10);

  const projectOptions = (projects ?? []).map((p) => ({
    id: String(p.id),
    title: String(p.title ?? "Project"),
  }));

  const personaOptions =
    personas && personas.length > 0
      ? personas.map((p) => ({ value: p.id, label: p.label }))
      : [
          { value: "friendly", label: "Friendly" },
          { value: "balanced", label: "Balanced" },
          { value: "strict", label: "Strict" },
          { value: "hostile", label: "Tough" },
        ];

  const handleZip = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        setProgress({ phase: "scan", detail: "Scanning project structure…" });
        const analysis = await analyzeZip(file, (phase, detail) =>
          setProgress({ phase, detail: detail ?? phase }),
        );

        setProgress({ phase: "pack", detail: "Building examiner knowledge pack…" });
        const form = new FormData();
        form.append("file", file);
        if (projectId) form.append("project_id", projectId);
        form.append("structure_json", JSON.stringify(analysis.structureSummary));
        form.append("language", language);
        form.append("persona", persona);
        form.append("duration_minutes", String(duration));

        const res = await api<{ session: { id: string } }>(
          "/api/advanced/code-aware/prepare-viva",
          {
            body: form,
          },
        );
        const sessionId = res.session?.id;
        if (!sessionId) throw new Error("No session returned");

        setProgress({ phase: "ready", detail: "Opening live viva…" });
        await navigate({
          to: "/advanced/viva-code-aware/session/$id",
          params: { id: sessionId },
        });
      } catch (e) {
        setError((e as Error).message || "Could not start code viva");
        setBusy(false);
        setProgress(null);
      }
    },
    [duration, language, navigate, persona, projectId],
  );

  return (
    <AppShell wide>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Code-Aware Viva</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a project ZIP and jump straight into a live mock viva. The examiner studies a
            compact knowledge pack of your code — no confusing architecture graphs.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Language</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={busy}
            >
              {LIVE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Persona</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              disabled={busy}
            >
              {personaOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Duration</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={busy}
            >
              {[5, 10, 15].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <UploadStep
          projects={projectOptions}
          projectId={projectId}
          onProjectId={setProjectId}
          onZip={handleZip}
          busy={busy}
          progress={progress}
          error={error}
        />

        <ol className="space-y-1.5 text-xs text-muted-foreground">
          <li>1. Choose language, persona, and length</li>
          <li>2. Drop your project ZIP (analyzed in your browser, then uploaded once)</li>
          <li>
            3. Live 3-pane mock viva: controls · conversation · scores — same style as Mock Viva
          </li>
        </ol>
      </div>
    </AppShell>
  );
}
