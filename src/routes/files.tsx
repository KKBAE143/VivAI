import { createFileRoute } from "@tanstack/react-router";
import {
  Upload,
  FileText,
  Download,
  Image as ImageIcon,
  FileArchive,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth-context";
import { useDeleteFile, useFiles, useUploadFile } from "@/lib/hooks";

export const Route = createFileRoute("/files")({
  head: () => ({
    meta: [
      { title: "Files & Resources — VivAI" },
      {
        name: "description",
        content: "All your project documents, reports, and slides in one place.",
      },
    ],
  }),
  component: Files,
});

const PAGE_SIZE = 6;

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
  const [page, setPage] = useState(1);

  const allFiles = files ?? [];
  const totalPages = Math.max(1, Math.ceil(allFiles.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleFiles = allFiles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Files & Resources
            </h1>
            <p className="text-xs text-muted-foreground">
              Project docs, reports, slides — everything in one place.
            </p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploadFile.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs sm:text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Upload className="h-4 w-4" /> {uploadFile.isPending ? "Uploading…" : "Upload"}
          </button>
        </div>

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

        {/* Compact Dropzone */}
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
          <Card
            className={`border-2 border-dashed bg-transparent p-3 shadow-none transition-colors ${
              dragging ? "border-primary" : "border-border"
            }`}
          >
            <div className="flex items-center justify-center gap-3 text-center">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Upload className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">
                  {uploadFile.isPending ? "Uploading…" : "Drag & drop or click to upload"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  PDF, DOCX, PPTX, images, ZIP up to 25 MB
                </div>
              </div>
            </div>
          </Card>
        </button>

        {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

        {/* Main File List */}
        <Card className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">All Files</h3>
              {allFiles.length > 0 && <Badge tone="muted">{allFiles.length} total</Badge>}
            </div>
            {isLoading ? (
              <div className="mt-3">
                <TableSkeleton rows={4} />
              </div>
            ) : error ? (
              <ErrorState
                message={error instanceof Error ? error.message : "Could not load your files"}
                onRetry={() => void refetch()}
              />
            ) : allFiles.length === 0 ? (
              <EmptyState
                title="No files yet"
                description="Upload your first document, report or slide deck."
              />
            ) : (
              <div className="mt-2.5 divide-y divide-border">
                {visibleFiles.map((f) => {
                  const I = iconFor(String(f.mime_type ?? ""));
                  const fileId = String(f.id);
                  return (
                    <div
                      key={fileId}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2"
                    >
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-secondary">
                        <I className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs sm:text-sm font-semibold">
                          {String(f.original_name ?? f.name)}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge>{f.project_id ? "Project file" : "General"}</Badge>
                          <span>{formatSize(Number(f.size_bytes ?? 0))}</span>
                          <span>·</span>
                          <span>{String(f.created_at ?? "").slice(0, 10)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          aria-label="Download"
                          onClick={() => void download(fileId)}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-secondary hover:bg-secondary/70"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label="Delete"
                          disabled={deleteFile.isPending}
                          onClick={() => deleteFile.mutate(fileId)}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {allFiles.length > 0 && (
            <DataPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={allFiles.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="files"
              className="mt-2 pt-2"
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
