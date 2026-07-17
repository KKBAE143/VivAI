import { useCallback, useRef, useState } from "react";
import { Archive, Loader2, Upload } from "lucide-react";
import { Card } from "@/components/app-shell";
import type { AnalyzeProgress } from "@/lib/codeflow";

export function UploadStep({
  projects,
  projectId,
  onProjectId,
  onZip,
  busy,
  progress,
  error,
}: {
  projects: { id: string; title: string }[];
  projectId: string;
  onProjectId: (id: string) => void;
  onZip: (file: File) => void;
  busy: boolean;
  progress: { phase: string; detail?: string } | null;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".zip") && file.type !== "application/zip") {
        return;
      }
      onZip(file);
    },
    [onZip],
  );

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-base font-semibold">
        <Archive className="h-5 w-5 text-primary" />
        Load your codebase
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Drop a project ZIP. We scan it locally, build an examiner brief, then open a live mock viva
        with AI and student chat in the center — no graph maze.
      </p>

      <label className="mt-4 block text-xs font-medium text-muted-foreground">
        Link to project (optional)
        <select
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={projectId}
          onChange={(e) => onProjectId(e.target.value)}
          disabled={busy}
        >
          <option value="">No project link</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`mt-5 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-secondary/30 hover:border-primary/50"
        } ${busy ? "opacity-70" : ""}`}
      >
        {busy ? (
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}
        <span className="mt-3 text-sm font-semibold">
          {busy ? progress?.detail || "Starting viva…" : "Drop a .zip to start the viva"}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">
          Scans locally first · then opens the live 3-pane session
        </span>
        {busy && progress?.phase && (
          <span className="mt-3 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            {progress.phase}
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
