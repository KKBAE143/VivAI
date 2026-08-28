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
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-graphik">
                Files & Resources
              </h1>
              <span className="text-[10px] sm:text-xs text-[#AFDDFF] bg-[#AFDDFF]/15 px-2 py-0.5 rounded font-mono">
                [ ASSETS_VAULT ]
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Project docs, reports, slides — encrypted defense artifacts in one place.
            </p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploadFile.isPending}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#AFDDFF] px-4 py-2 text-xs sm:text-sm font-bold text-black shadow-[0_0_15px_rgba(175,221,255,0.25)] hover:bg-[#c8e8ff] active:scale-95 disabled:opacity-50 transition-all cursor-pointer uppercase tracking-wider"
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
          className="w-full text-left cursor-pointer"
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
          <div
            className={`rounded-2xl border-2 border-dashed p-4 backdrop-blur-2xl transition-all ${
              dragging
                ? "border-[#AFDDFF] bg-[#AFDDFF]/10 shadow-[0_0_20px_rgba(175,221,255,0.2)]"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center justify-center gap-3 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#AFDDFF]/15 text-[#AFDDFF] border border-[#AFDDFF]/30">
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-xs sm:text-sm font-bold text-white font-graphik">
                  {uploadFile.isPending ? "Uploading…" : "Drag & drop or click to upload"}
                </div>
                <div className="text-[10px] sm:text-xs text-white/50 font-mono">
                  PDF, DOCX, PPTX, images, ZIP up to 25 MB
                </div>
              </div>
            </div>
          </div>
        </button>

        {uploadError && <p className="text-xs font-mono text-rose-400">{uploadError}</p>}

        {/* Main File List */}
        <div className="rounded-2xl border border-white/10 bg-card/85 p-4 sm:p-5 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold text-white font-graphik tracking-wide">
                [ ALL_FILES ]
              </h3>
              {allFiles.length > 0 && (
                <span className="text-[11px] font-mono text-white/60 bg-white/10 px-2 py-0.5 rounded">
                  {allFiles.length} total
                </span>
              )}
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
              <div className="mt-2.5 divide-y divide-white/5">
                {visibleFiles.map((f) => {
                  const I = iconFor(String(f.mime_type ?? ""));
                  const fileId = String(f.id);
                  return (
                    <div
                      key={fileId}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5 hover:bg-white/5 rounded-xl px-2.5 transition-colors"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 border border-white/10 text-[#AFDDFF]">
                        <I className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs sm:text-sm font-bold text-white">
                          {String(f.original_name ?? f.name)}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px] text-white/50 font-mono">
                          <span className="bg-white/10 px-2 py-0.5 rounded text-white/80">
                            {f.project_id ? "Project file" : "General"}
                          </span>
                          <span>{formatSize(Number(f.size_bytes ?? 0))}</span>
                          <span>·</span>
                          <span>{String(f.created_at ?? "").slice(0, 10)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          aria-label="Download"
                          onClick={() => void download(fileId)}
                          className="min-h-[38px] min-w-[38px] grid place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Delete"
                          disabled={deleteFile.isPending}
                          onClick={() => deleteFile.mutate(fileId)}
                          className="min-h-[38px] min-w-[38px] grid place-items-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
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
        </div>
      </div>
    </AppShell>
  );
}
