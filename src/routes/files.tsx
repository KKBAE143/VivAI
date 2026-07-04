import { createFileRoute } from "@tanstack/react-router";
import { Upload, FileText, Download, Image as ImageIcon, FileArchive, FileSpreadsheet, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth-context";
import { useDeleteFile, useFiles, useUploadFile } from "@/lib/hooks";

export const Route = createFileRoute("/files")({
  head: () => ({
    meta: [
      { title: "Files & Resources — CollgePro Navigator" },
      { name: "description", content: "All your project documents, reports, and slides in one place." },
    ],
  }),
  component: Files,
});

function iconFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("zip")) return FileArchive;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return FileText;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function Files() {
  useRequireAuth();
  const { data: files, isLoading, error, refetch } = useFiles();
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);

  const doUpload = async (file: File) => {
    setUploadError("");
    try {
      await uploadFile.mutateAsync({ file });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const download = async (fileId: string) => {
    try {
      const res = await api<{ download_url?: string }>(`/api/files/${fileId}`);
      if (res.download_url) window.open(res.download_url, "_blank", "noopener");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Files & Resources"
        subtitle="Project docs, reports, slides — everything in one place."
        action={
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploadFile.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Upload className="h-4 w-4" /> {uploadFile.isPending ? "Uploading…" : "Upload"}
          </button>
        }
      />
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void doUpload(file);
          e.target.value = "";
        }}
      />
      <button
        className="w-full text-left"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void doUpload(file);
        }}
      >
        <Card className={`border-2 border-dashed bg-transparent shadow-none transition-colors ${dragging ? "border-primary" : "border-border"}`}>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div className="mt-3 text-sm font-semibold">
              {uploadFile.isPending ? "Uploading…" : "Drag & drop files here"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PPTX, images, ZIP up to 25 MB</div>
          </div>
        </Card>
      </button>
      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      <Card>
        <h3 className="text-base font-semibold">All Files</h3>
        {isLoading ? (
          <div className="mt-4">
            <TableSkeleton rows={5} />
          </div>
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Could not load your files"}
            onRetry={() => void refetch()}
          />
        ) : (files ?? []).length === 0 ? (
          <EmptyState title="No files yet" description="Upload your first document, report or slide deck." />
        ) : (
          <div className="mt-4 divide-y divide-border">
            {(files ?? []).map((f) => {
              const I = iconFor(String(f.mime_type ?? ""));
              const fileId = String(f.id);
              return (
                <div key={fileId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-3.5">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
                    <I className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{String(f.original_name ?? f.name)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge>{f.project_id ? "Project file" : "General"}</Badge>
                      <span>{formatSize(Number(f.size_bytes ?? 0))}</span>
                      <span>·</span>
                      <span>{String(f.created_at ?? "").slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Download"
                      onClick={() => void download(fileId)}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-secondary hover:bg-secondary/70"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Delete"
                      disabled={deleteFile.isPending}
                      onClick={() => deleteFile.mutate(fileId)}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AppShell>
  );
}