import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileUp, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { MaterialImage } from "@/components/live/material-image";
import { useRequireAuth } from "@/lib/auth-context";
import { LIVE_LANGUAGES } from "@/lib/languages";
import { useScenarioCatalog } from "@/lib/hooks-features";
import {
  useCreatePresentation,
  useCreatePresentationMaterial,
  useDeletePresentationMaterial,
  usePresentationMaterial,
  usePresentationMaterials,
  usePresentations,
  useProjects,
  useRetryPresentationMaterial,
  useUploadFile,
  type PresentationMaterial,
} from "@/lib/hooks";

export const Route = createFileRoute("/ai-presentation/")({ component: AIPresentation });

const DURATIONS = [5, 10, 15, 20, 30];
const COACH_SCENARIOS = new Set([
  "project_defense",
  "startup_pitch",
  "fundraising_pitch",
  "hackathon_judging",
  "innovation_competition",
  "business_plan_competition",
  "technical_architecture_review",
  "product_demonstration",
  "client_presentation",
  "research_presentation",
  "accelerator_interview",
  "grant_evaluation",
]);

function AIPresentation() {
  useRequireAuth();
  const navigate = useNavigate();
  const projects = useProjects();
  const sessions = usePresentations();
  const materials = usePresentationMaterials();
  const materialActions = {
    upload: useUploadFile(),
    create: useCreatePresentationMaterial(),
    retry: useRetryPresentationMaterial(),
    remove: useDeletePresentationMaterial(),
  };
  const createSession = useCreatePresentation();
  const scenarios = useScenarioCatalog();
  const [projectId, setProjectId] = useState("");
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"learning" | "practice">("learning");
  const [difficulty, setDifficulty] = useState("beginner");
  const [language, setLanguage] = useState("English");
  const [duration, setDuration] = useState(10);
  const [scenarioId, setScenarioId] = useState("project_defense");
  const [startUnit, setStartUnit] = useState("");
  const [endUnit, setEndUnit] = useState("");
  const [error, setError] = useState("");
  const materialDetail = usePresentationMaterial(selected || undefined);
  const selectedMaterial =
    materialDetail.data ??
    (materials.data ?? []).find((material) => String(material.id) === selected);
  const usable = selectedMaterial?.status === "ready" || selectedMaterial?.status === "partial";
  const units = Array.isArray(selectedMaterial?.units) ? selectedMaterial.units : [];
  const warnings = Array.isArray(selectedMaterial?.warnings)
    ? selectedMaterial.warnings.map(String)
    : [];
  const unitCount = Number(selectedMaterial?.unit_count ?? units.length ?? 0);

  const onUpload = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      const row = await materialActions.upload.mutateAsync({
        file,
        projectId: projectId || undefined,
      });
      const material = await materialActions.create.mutateAsync({
        fileId: String(row.id),
        projectId: projectId || null,
      });
      setSelected(String(material.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    }
  };

  const begin = async () => {
    if (!selectedMaterial || !usable) return;
    setError("");
    try {
      const result = await createSession.mutateAsync({
        material_id: selectedMaterial.id,
        project_id: projectId || null,
        training_mode: mode,
        difficulty,
        scenario_id: scenarioId,
        language,
        duration_minutes: duration,
        selected_unit_start: startUnit ? Number(startUnit) : null,
        selected_unit_end: endUnit ? Number(endUnit) : null,
        session_type: "Presentation Coach",
      });
      await navigate({ to: "/ai-presentation/session/$id", params: { id: String(result.id) } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start coach");
    }
  };

  const availableScenarios = (scenarios.data ?? []).filter((item) => COACH_SCENARIOS.has(item.id));
  return (
    <AppShell fitViewport>
      <div className="mx-auto grid max-w-6xl gap-5 pb-8 lg:grid-cols-[1.1fr_.9fr]">
        <section className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold">AI Presentation Coach</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload once, then learn or practise against the real material slide by slide.
            </p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Your materials</h2>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                <FileUp className="h-4 w-4" /> Upload material
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
                  onChange={(event) => void onUpload(event.target.files?.[0])}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              PPTX, PPT, PDF, DOCX, DOC, or TXT · up to 25 MB
            </p>
            {materials.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading materials…</p>
            ) : (
              <div className="mt-4 space-y-2">
                {(materials.data ?? []).map((material) => (
                  <MaterialRow
                    key={material.id}
                    material={material}
                    selected={selected === String(material.id)}
                    onSelect={() => setSelected(String(material.id))}
                    onRetry={() => void materialActions.retry.mutateAsync(String(material.id))}
                    onDelete={() => void materialActions.remove.mutateAsync(String(material.id))}
                  />
                ))}
                {!materials.data?.length && (
                  <EmptyState
                    title="Upload presentation material"
                    description="Processed materials remain reusable for future practice."
                  />
                )}
              </div>
            )}
          </div>

          {selectedMaterial && (
            <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl bg-secondary">
                  {usable && units[0] ? (
                    <MaterialImage
                      materialId={String(selectedMaterial.id)}
                      ordinal={Number(units[0].ordinal ?? 1)}
                      thumbnail
                      alt="First material preview"
                      className="h-32 w-full object-contain"
                      fallback={
                        <span className="p-3 text-xs text-muted-foreground">
                          Structured text preview
                        </span>
                      }
                    />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                </div>
                <div>
                  <h2 className="font-semibold">
                    {String(selectedMaterial.title ?? "Presentation material")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {String(selectedMaterial.source_type ?? "file").toUpperCase()} ·{" "}
                    {unitCount || "—"} units
                    {unitCount
                      ? ` · about ${Math.max(5, unitCount * 2)} minutes for full coverage`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs capitalize">
                    Processing status: <strong>{String(selectedMaterial.status)}</strong>
                  </p>
                  {selectedMaterial.status === "queued" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Waiting for the extraction worker. Processing continues in the background,
                      so you can leave this page and return later.
                    </p>
                  )}
                  {selectedMaterial.status === "processing" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Extracting slide text, notes, and previews. This can take a few minutes for a
                      large deck.
                    </p>
                  )}
                  {warnings.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-warning">
                      {warnings.slice(0, 4).map((warning) => (
                        <li key={warning} className="flex gap-1.5">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedMaterial.processing_error ? (
                    <p className="mt-3 text-xs text-destructive">
                      {String(selectedMaterial.processing_error)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-semibold">Past sessions</h2>
            {sessions.error ? (
              <ErrorState
                message="Could not load sessions"
                onRetry={() => void sessions.refetch()}
              />
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(sessions.data ?? []).slice(0, 6).map((session) => (
                  <Link
                    key={String(session.id)}
                    to="/ai-presentation/session/$id"
                    params={{ id: String(session.id) }}
                    className="rounded-xl bg-secondary p-3 text-sm no-underline"
                  >
                    <div className="font-medium">
                      {String(session.session_type ?? "Presentation")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {String(session.status ?? "Pending")} ·{" "}
                      {String(session.created_at ?? "").slice(0, 10)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-4 lg:h-fit">
          <h2 className="font-semibold">Coach setup</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedMaterial
              ? `${selectedMaterial.status ?? "queued"} material selected`
              : "Choose a processed material to begin."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Project">
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">No project</option>
                {(projects.data ?? []).map((project) => (
                  <option key={String(project.id)} value={String(project.id)}>
                    {String(project.title)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mode">
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="learning">Learning</option>
                <option value="practice">Practice</option>
              </select>
            </Field>
            <Field label="Difficulty">
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert Judge</option>
              </select>
            </Field>
            <Field label="Language">
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LIVE_LANGUAGES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Duration">
              <select
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                {DURATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item} minutes
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scenario">
              <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
                {availableScenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start unit (optional)">
              <input
                type="number"
                min="1"
                max={unitCount || undefined}
                value={startUnit}
                onChange={(event) => setStartUnit(event.target.value)}
              />
            </Field>
            <Field label="End unit (optional)">
              <input
                type="number"
                min="1"
                max={unitCount || undefined}
                value={endUnit}
                onChange={(event) => setEndUnit(event.target.value)}
              />
            </Field>
          </div>
          {mode === "learning" && (
            <p className="mt-3 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
              Learning uses coached retries and keeps the camera off. Continue anyway becomes
              available after two retries.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <button
            disabled={!usable || createSession.isPending}
            onClick={() => void begin()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createSession.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {!selectedMaterial
              ? "Select material"
              : !usable
                ? "Waiting for material"
                : "Start presentation coach"}
          </button>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <span className="mt-1 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:p-2 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:p-2">
        {children}
      </span>
    </label>
  );
}

function MaterialRow({
  material,
  selected,
  onSelect,
  onRetry,
  onDelete,
}: {
  material: PresentationMaterial;
  selected: boolean;
  onSelect: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const status = String(material.status ?? "queued");
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 ${selected ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <button onClick={onSelect} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">
          {String(material.title ?? "Presentation material")}
        </p>
        <p className="mt-1 text-xs capitalize text-muted-foreground">
          {String(material.source_type ?? "file").toUpperCase()} · {status}
          {material.unit_count ? ` · ${String(material.unit_count)} units` : ""}
        </p>
      </button>
      {(status === "queued" || status === "processing") && (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      )}
      {status === "failed" && (
        <button
          onClick={onRetry}
          aria-label="Retry processing"
          className="rounded-lg bg-secondary p-2"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={onDelete}
        aria-label="Delete material"
        className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
