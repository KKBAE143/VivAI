import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ImagePlus,
  Send,
  X,
  MessageSquare,
  Image as ImageIcon,
  CheckCircle2,
  MonitorUp,
  Camera,
  MonitorStop,
  Volume2,
  VolumeX,
  GraduationCap,
  Mic,
  MicOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import {
  useAskPresentation,
  useAskPresentationQuestion,
  useAnswerPresentationQuestion,
  useEndPresentation,
  usePresentationSession,
  useStartPresentation,
  useUploadSlide,
} from "@/lib/hooks";
import { useSpeechToText, useTextToSpeech } from "@/lib/speech";

export const Route = createFileRoute("/ai-presentation/session/$id")({
  head: () => ({ meta: [{ title: "Live Presentation Session — CollegePro Navigator" }] }),
  component: PresentationSession,
});

interface SlideEntry {
  slide_number?: number;
  comments?: string;
  clarity_score?: number;
  score?: number;
  feedback?: string;
  topics?: Record<string, number>;
  [k: string]: unknown;
}

interface QaEntry {
  kind: "coach_chat" | "exam_q";
  question: string;
  answer?: string | null;
  topic?: string | null;
  expected_answer?: string | null;
  answered?: boolean;
  score?: number | null;
  feedback?: string | null;
}

function PresentationSession() {
  useRequireAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, refetch } = usePresentationSession(id);

  const start = useStartPresentation();
  const upload = useUploadSlide();
  const ask = useAskPresentation();
  const askQuestion = useAskPresentationQuestion();
  const answerQuestion = useAnswerPresentationQuestion();
  const end = useEndPresentation();

  const language = String(session?.language ?? "English");
  const tts = useTextToSpeech(language);
  const stt = useSpeechToText(language);

  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [examAnswer, setExamAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const bootstrapped = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const spokenRef = useRef<string>("");
  const answerBaseRef = useRef("");

  const screenShareSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

  const state =
    (session?.topic_scores as
      | { slides?: SlideEntry[]; topics?: Record<string, number>; qa?: QaEntry[] }
      | undefined) ?? {};
  const slides: SlideEntry[] = state.slides ?? [];
  const topicScores: Record<string, number> = state.topics ?? {};
  const qa: QaEntry[] = state.qa ?? [];
  const chat = qa.filter((x) => x.kind === "coach_chat");
  const examQuestions = qa.filter((x) => x.kind === "exam_q");
  const openExam = [...examQuestions].reverse().find((x) => !x.answered) ?? null;

  const isCompleted = session?.status === "Completed";

  // Bootstrap: start pending session once.
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

  // Speak the newest open examiner question aloud.
  const speak = tts.speak;
  useEffect(() => {
    if (openExam && openExam.question !== spokenRef.current) {
      spokenRef.current = openExam.question;
      speak(openExam.question);
    }
  }, [openExam, speak]);

  // Live dictation into the exam answer box.
  useEffect(() => {
    if (!stt.listening) return;
    setExamAnswer(`${answerBaseRef.current} ${stt.transcript} ${stt.interim}`.trim());
  }, [stt.listening, stt.transcript, stt.interim]);

  // Clean up the screen share stream on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      tts.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
  }, []);

  const startSharing = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharing);
      setSharing(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return; // user cancelled
      setError("Could not start screen share.");
    }
  };

  const captureSlide = () =>
    (async () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        setError("Screen not ready yet — try again in a moment.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unsupported");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
        if (!blob) throw new Error("Capture failed");
        const captured = new File([blob], `slide-${Date.now()}.jpg`, { type: "image/jpeg" });
        await upload.mutateAsync({ id, file: captured });
        void refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Capture failed");
      } finally {
        setBusy(false);
      }
    })();

  const handleUpload = () =>
    (async () => {
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        await upload.mutateAsync({ id, file });
        setFile(null);
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
        void refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ask failed");
      } finally {
        setBusy(false);
      }
    })();

  const handleExaminerAsk = () =>
    (async () => {
      setBusy(true);
      setError("");
      try {
        await askQuestion.mutateAsync(id);
        setExamAnswer("");
        answerBaseRef.current = "";
        stt.reset();
        void refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate a question");
      } finally {
        setBusy(false);
      }
    })();

  const handleExaminerAnswer = () =>
    (async () => {
      const a = examAnswer.trim();
      if (!a) return;
      stt.stop();
      setBusy(true);
      setError("");
      try {
        await answerQuestion.mutateAsync({ id, answer: a });
        setExamAnswer("");
        answerBaseRef.current = "";
        stt.reset();
        void refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit answer");
      } finally {
        setBusy(false);
      }
    })();

  const toggleMic = () => {
    if (!stt.supported) return;
    if (stt.listening) {
      stt.stop();
    } else {
      answerBaseRef.current = examAnswer;
      stt.reset();
      stt.start();
    }
  };

  const handleEnd = () =>
    (async () => {
      if (!window.confirm("End this presentation session? You'll see your full report next.")) return;
      setBusy(true);
      setError("");
      try {
        stopSharing();
        tts.cancel();
        await end.mutateAsync(id);
        void refetch();
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
  const answeredExam = examQuestions.filter((x) => x.answered);

  // ---------- Completed: full report ----------
  if (isCompleted) {
    const persistedReport = (state as { report?: { gaps?: string[]; qa_feedback?: string | null } }).report ?? {};
    const gaps = (session?.gaps as string[] | undefined) ?? persistedReport.gaps ?? [];
    const qaFeedback = (session?.qa_feedback as string | undefined) ?? persistedReport.qa_feedback ?? null;
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{title} Presentation — Report</div>
              <div className="text-xs text-muted-foreground">{slides.length} slides · {answeredExam.length} questions</div>
            </div>
            <Link to="/ai-presentation" className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium">
              Back to sessions
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Overall", session?.overall_score],
              ["Clarity", session?.clarity_score],
              ["Confidence", session?.confidence_score],
              ["Coverage", session?.coverage_score],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-2xl bg-card p-4 text-center shadow-[var(--shadow-card)]">
                <div className="text-2xl font-bold">{val == null ? "—" : `${val}%`}</div>
                <div className="text-xs text-muted-foreground">{String(label)}</div>
              </div>
            ))}
          </div>

          {session?.feedback_summary ? (
            <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-sm font-semibold">Summary</h3>
              <p className="mt-2 text-sm leading-relaxed">{String(session.feedback_summary)}</p>
              {qaFeedback ? (
                <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">{qaFeedback}</p>
              ) : null}
            </div>
          ) : null}

          {gaps.length > 0 && (
            <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-sm font-semibold">Areas to improve</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {gaps.map((g) => (
                  <span key={g} className="rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {answeredExam.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Examiner Q&amp;A</h3>
              {answeredExam.map((q, i) => {
                const score = q.score == null ? null : Number(q.score);
                return (
                  <article key={i} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Q{i + 1}
                        {q.topic ? ` · ${q.topic}` : ""}
                      </span>
                      {score != null && (
                        <span className={`text-sm font-semibold ${score >= 60 ? "text-success" : "text-warning"}`}>
                          {score}/100
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2 text-base font-semibold leading-snug">{q.question}</h4>
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">Your answer: </span>
                      {q.answer || <span className="italic text-muted-foreground">No answer</span>}
                    </p>
                    {q.feedback && <p className="mt-2 rounded-xl bg-secondary p-3 text-sm">{q.feedback}</p>}
                  </article>
                );
              })}
            </div>
          )}

          {slides.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Slide feedback</h3>
              {slides.map((sl, i) => {
                const score = Number(sl.clarity_score ?? sl.score ?? 0);
                const comments = String(sl.comments ?? sl.feedback ?? "");
                return (
                  <div key={i} className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                      <span className="text-muted-foreground">Slide {sl.slide_number ?? i + 1}</span>
                      <span className={score >= 70 ? "text-success" : "text-warning"}>{score > 0 ? score : "—"}</span>
                    </div>
                    {comments && <p className="mt-1.5 text-sm">{comments}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Live session ----------
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/ai-presentation" className="grid h-9 w-9 place-items-center rounded-xl bg-secondary" aria-label="Back">
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
            {tts.supported && (
              <button
                onClick={tts.toggleMute}
                aria-label={tts.muted ? "Unmute examiner voice" : "Mute examiner voice"}
                className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
              >
                {tts.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => void handleEnd()}
              disabled={busy || !started}
              className="flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" /> End &amp; report
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_340px]">
        <main className="space-y-6">
          {/* Screen share / capture */}
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Present your slides</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Share your screen and capture each slide, or upload slide images below.
                </p>
              </div>
              {screenShareSupported &&
                (sharing ? (
                  <button
                    onClick={stopSharing}
                    className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
                  >
                    <MonitorStop className="h-4 w-4" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={() => void startSharing()}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <MonitorUp className="h-4 w-4" /> Share screen
                  </button>
                ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-secondary">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`aspect-video w-full bg-foreground/5 ${sharing ? "block" : "hidden"}`}
              />
              {!sharing && (
                <div className="grid aspect-video w-full place-items-center text-center text-xs text-muted-foreground">
                  {screenShareSupported
                    ? "Screen preview appears here after you share."
                    : "Screen share isn't supported in this browser — upload slide images below."}
                </div>
              )}
            </div>

            {sharing && (
              <button
                onClick={() => void captureSlide()}
                disabled={busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-50"
              >
                <Camera className="h-4 w-4" /> {busy ? "Analyzing…" : "Capture current slide"}
              </button>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary px-4 py-3 text-sm transition-colors hover:border-primary">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{file ? file.name : "Or choose a slide image…"}</span>
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
                <ImagePlus className="h-4 w-4" /> {upload.isPending ? "Analyzing…" : "Upload"}
              </button>
            </div>
          </div>

          {/* AI Examiner */}
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <GraduationCap className="h-4 w-4" /> AI Faculty Examiner
              </h2>
              <button
                onClick={() => void handleExaminerAsk()}
                disabled={busy || !started}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {askQuestion.isPending ? "Thinking…" : openExam ? "Ask another" : "Ask me a question"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              The examiner asks follow-ups grounded in the slides you&apos;ve presented.
            </p>

            {openExam ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-primary-soft p-4">
                  {openExam.topic && (
                    <span className="text-[11px] font-medium uppercase tracking-wider text-accent-foreground">
                      {openExam.topic}
                    </span>
                  )}
                  <p className="mt-1 text-sm font-semibold text-accent-foreground">{openExam.question}</p>
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={examAnswer}
                    onChange={(e) => setExamAnswer(e.target.value)}
                    placeholder="Speak or type your answer…"
                    className="flex-1 rounded-xl border border-border bg-secondary px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                  <div className="flex flex-col gap-2">
                    {stt.supported && (
                      <button
                        onClick={toggleMic}
                        aria-label={stt.listening ? "Stop recording" : "Answer by voice"}
                        className={`grid h-10 w-10 place-items-center rounded-xl text-primary-foreground ${
                          stt.listening ? "bg-destructive" : "bg-primary"
                        }`}
                      >
                        {stt.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => void handleExaminerAnswer()}
                      disabled={busy || !examAnswer.trim()}
                      className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background disabled:opacity-50"
                      aria-label="Submit answer"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                {answeredExam.length > 0
                  ? `${answeredExam.length} question(s) answered. Ask another when you're ready.`
                  : "No open question. Present a few slides, then ask the examiner to quiz you."}
              </p>
            )}
          </div>

          {/* Coach chat */}
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <MessageSquare className="h-4 w-4" /> Ask your coach
            </h2>
            {chat.length > 0 && (
              <div className="mt-4 space-y-3">
                {chat.map((c, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {c.question}
                    </p>
                    <p className="max-w-[85%] rounded-xl rounded-bl-sm bg-secondary px-3 py-2 text-sm">{c.answer}</p>
                  </div>
                ))}
              </div>
            )}
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

          {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </main>

        <aside className="space-y-5">
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Slides reviewed ({slides.length})</h3>
            {slides.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No slides analyzed yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {slides.map((sl, i) => {
                  const score = Number(sl.clarity_score ?? sl.score ?? 0);
                  const comments = String(sl.comments ?? sl.feedback ?? "");
                  return (
                    <div key={i} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                        <span className="text-muted-foreground">Slide {sl.slide_number ?? i + 1}</span>
                        <span className={score >= 70 ? "text-success" : "text-warning"}>{score > 0 ? score : "—"}</span>
                      </div>
                      {comments && <p className="mt-1.5 text-xs">{comments}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-semibold">Examiner Q&amp;A ({answeredExam.length})</h3>
            {answeredExam.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Answered questions will be scored here.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {answeredExam.map((q, i) => {
                  const score = Number(q.score ?? 0);
                  return (
                    <div key={i} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                        <span className="text-muted-foreground">Q{i + 1}</span>
                        <span className={score >= 60 ? "text-success" : "text-warning"}>{score}</span>
                      </div>
                      <p className="mt-1.5 text-xs">{q.question}</p>
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
        </aside>
      </div>
    </div>
  );
}
