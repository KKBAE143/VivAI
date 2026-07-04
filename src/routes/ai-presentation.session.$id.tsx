import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Send, X, MessageSquare, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useAskPresentation,
  useEndPresentation,
  usePresentationSession,
  useStartPresentation,
  useUploadSlide,
} from "@/lib/hooks";

export const Route = createFileRoute("/ai-presentation/session/$id")({
  head: () => ({ meta: [{ title: "Live Presentation Session — CollegePro Navigator" }] }),
  component: PresentationSession,
});

interface SlideEntry {
  slide_number: number;
  // The backend returns the Gemini JSON spread into the response; tolerate any shape.
  comments?: string;
  clarity_score?: number;
  score?: number;
  feedback?: string;
  topics?: Record<string, number>;
  [k: string]: unknown;
}

function PresentationSession() {
  useRequireAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, refetch } = usePresentationSession(id);

  const start = useStartPresentation();
  const upload = useUploadSlide();
  const ask = useAskPresentation();
  const end = useEndPresentation();

  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const bootstrapped = useRef(false);

  // Bootstrap: if status is Pending, call /start once. Re-runs on refetch.
  useEffect(() => {
    if (!session || bootstrapped.current) return;
    if (session.status === "Pending" && !started) {
      bootstrapped.current = true;
      start.mutate(id, {
        onSuccess: () => {
          setStarted(true);
          void refetch();
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Could not start session"),
      });
    } else if (session.status && session.status !== "Pending") {
      bootstrapped.current = true;
      setStarted(true);
    }
  }, [session, id, started, start, refetch]);

  const handleUpload = () =>
    (async () => {
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        await upload.mutateAsync({ id, file });
        setFile(null);
        // reset the file input so the same file can be re-uploaded if needed
        const input = document.getElementById("slide-file") as HTMLInputElement | null;
        if (input) input.value = "";
        void refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    })();

  const handleAsk = () =>
    (async () => {
      const q = question.trim();
      if (!q) return;
      setBusy(true);
      setError("");
      try {
        await ask.mutateAsync({ id, question: q });
        setQuestion("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ask failed");
      } finally {
        setBusy(false);
      }
    })();

  const handleEnd = () =>
    (async () => {
      if (!window.confirm("End this presentation session? You'll see your report on the AI Presentation page.")) return;
      setBusy(true);
      setError("");
      try {
        await end.mutateAsync(id);
        navigate({ to: "/ai-presentation" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not end session");
      } finally {
        setBusy(false);
      }
    })();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  const title = String(session?.session_type ?? "Presentation");
  const isCompleted = session?.status === "Completed";
  const state = (session?.topic_scores as { slides?: SlideEntry[]; topics?: Record<string, number> } | undefined) ?? {};
  const slides: SlideEntry[] = state.slides ?? [];
  const topicScores: Record<string, number> = state.topics ?? {};

  // Backend doesn't persist Q&A separately; keep them in-session only.
  // No persistent Q&A list is loaded.

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/ai-presentation"
              className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-sm font-semibold">{title} Presentation</div>
              <div className="text-xs text-muted-foreground">
                {String(session?.duration_minutes ?? "—")} min · {String(session?.status ?? "Pending")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Completed
              </span>
            ) : (
              <button
                onClick={() => void handleEnd()}
                disabled={busy || !started}
                className="flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" /> End Session
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          {isCompleted && (
            <div className="rounded-2xl bg-success/10 p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
              <h2 className="mt-3 text-xl font-bold">Session complete</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Overall {String(session?.overall_score ?? "—")}% · Clarity {String(session?.clarity_score ?? "—")}% · Confidence {String(session?.confidence_score ?? "—")}% · Coverage {String(session?.coverage_score ?? "—")}%
              </p>
              {session?.feedback_summary ? (
                <p className="mt-3 text-sm">{String(session.feedback_summary)}</p>
              ) : null}
              <Link
                to="/ai-presentation"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background"
              >
                Back to AI Presentation
              </Link>
            </div>
          )}

          {!isCompleted && (
            <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold">Upload a slide</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload slide images (PNG / JPEG / WEBP). AI faculty will critique clarity, layout, and coverage.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary px-4 py-3 text-sm transition-colors hover:border-primary">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">
                    {file ? file.name : "Choose slide image…"}
                  </span>
                  <input
                    id="slide-file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  onClick={() => void handleUpload()}
                  disabled={busy || !file || !started}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <ImagePlus className="h-4 w-4" />
                  {upload.isPending ? "Analyzing…" : "Upload"}
                </button>
              </div>
            </div>
          )}

          {!isCompleted && (
            <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold">Ask a follow-up</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask the AI coach anything about your presentation (delivery, content, structure).
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <textarea
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. How can I improve my intro?"
                  className="flex-1 rounded-xl border border-border bg-secondary px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() => void handleAsk()}
                  disabled={busy || !question.trim() || !started}
                  className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> {ask.isPending ? "Asking…" : "Ask"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </main>

        <aside className="space-y-5">
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Slides reviewed ({slides.length})</h3>
            {slides.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No slides uploaded yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {slides.map((sl, i) => {
                  const score = Number(sl.clarity_score ?? sl.score ?? 0);
                  const comments = String(sl.comments ?? sl.feedback ?? "");
                  return (
                    <div key={i} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                        <span className="text-muted-foreground">Slide {sl.slide_number ?? i + 1}</span>
                        <span className={score >= 70 ? "text-success" : "text-warning"}>
                          {score > 0 ? `${score}` : "—"}
                        </span>
                      </div>
                      {comments && <p className="mt-1.5 text-xs">{comments}</p>}
                      {sl.topics && typeof sl.topics === "object" && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(sl.topics).slice(0, 4).map(([t, sc]) => (
                            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                              {t}: {String(sc)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {Object.keys(topicScores).length > 0 && (
            <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-sm font-semibold">Topic coverage</h3>
              <div className="mt-4 space-y-2">
                {Object.entries(topicScores).map(([t, sc]) => (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className="truncate">{t}</span>
                    <span className="font-semibold">{String(sc)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" /> Live transcript
            </h3>
            <p className="mt-3 text-xs text-muted-foreground">
              Q&A entries appear in the report at session end. Live: {String(slides.length)} slide(s) analyzed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
