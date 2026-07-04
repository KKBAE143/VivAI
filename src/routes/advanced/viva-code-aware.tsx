import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Code2, Upload, Play, Square } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/hooks";
import { useCodeSnapshots, useCodeUpload } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/viva-code-aware")({
  head: () => ({ meta: [{ title: "Code-Aware Viva — CollgePro Navigator" }] }),
  component: CodeAwareViva,
});

interface CodeQuestion {
  question_id: string;
  question: string;
  file?: string;
  code_excerpt?: string;
}

function CodeAwareViva() {
  const { data: snapshots } = useCodeSnapshots();
  const { data: projects } = useProjects();
  const upload = useCodeUpload();
  const [projectId, setProjectId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<CodeQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startSession = (snapshotId: string) =>
    run(async () => {
      await api(`/api/advanced/code-aware/analyze?snapshot_id=${snapshotId}`, { method: "POST" });
      const session = await api<{ id: string }>("/api/advanced/code-aware/session", {
        body: { snapshot_id: snapshotId, project_id: projectId || null },
      });
      setSessionId(session.id);
      setSummary(null);
      setQuestion(await api<CodeQuestion>(`/api/advanced/code-aware/${session.id}/start`, { method: "POST" }));
    });

  const submitAnswer = () =>
    run(async () => {
      if (!sessionId) return;
      const res = await api<{ evaluation: { score: number; feedback: string }; next_question: CodeQuestion }>(
        `/api/advanced/code-aware/${sessionId}/answer`,
        { body: { answer } },
      );
      setFeedback(`Score ${res.evaluation.score}/100 — ${res.evaluation.feedback}`);
      setQuestion(res.next_question);
      setAnswer("");
    });

  const endSession = () =>
    run(async () => {
      if (!sessionId) return;
      setSummary(await api(`/api/advanced/code-aware/${sessionId}/end`, { method: "POST" }));
      setSessionId(null);
      setQuestion(null);
    });

  return (
    <AppShell>
      <PageHeader title="Code-Aware Viva" subtitle="The AI reads your actual source code and grills you on it — like real faculty." />
      {error && <Card className="mb-4 border-destructive text-sm text-destructive">{error}</Card>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Upload className="h-4 w-4" /> Your Code</h3>
          <select className="mt-3 w-full rounded-lg border bg-background p-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Link to project (optional)</option>
            {(projects ?? []).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>{String(p.title)}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".zip"
            className="mt-3 w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate({ file, projectId: projectId || undefined });
            }}
          />
          {upload.isPending && <p className="mt-2 text-xs text-muted-foreground">Uploading and parsing ZIP…</p>}
          <div className="mt-4 space-y-2">
            {(snapshots ?? []).map((s) => (
              <div key={String(s.id)} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span className="truncate">{String(s.name)} ({String(s.file_count)} files)</span>
                <button disabled={busy} onClick={() => startSession(String(s.id))} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  <Play className="h-3 w-3" /> Start
                </button>
              </div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold"><Code2 className="h-4 w-4" /> Live Session</h3>
            {sessionId && (
              <button disabled={busy} onClick={endSession} className="flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-semibold">
                <Square className="h-3 w-3" /> End & Score
              </button>
            )}
          </div>
          {busy && <p className="mt-3 text-sm text-muted-foreground">Thinking…</p>}
          {question && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                {question.file && <Badge tone="muted">{question.file}</Badge>}
                <p className="mt-2 text-sm font-medium">{question.question}</p>
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} placeholder="Your answer…" className="mt-3 w-full rounded-lg border bg-background p-2 text-sm" />
                <button disabled={busy || !answer.trim()} onClick={submitAnswer} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Submit Answer</button>
                {feedback && <p className="mt-3 rounded-lg bg-muted p-2 text-xs">{feedback}</p>}
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">{question.code_excerpt || "// code excerpt"}</pre>
            </div>
          )}
          {summary && (
            <div className="mt-4 rounded-lg border p-4 text-sm">
              <div className="text-2xl font-bold">{String(summary.overall_score)}%</div>
              <p className="mt-1">{String(summary.summary)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Code coverage: {(summary.code_coverage as string[] | undefined)?.join(", ") || "—"}</p>
            </div>
          )}
          {!question && !summary && !busy && <p className="mt-4 text-sm text-muted-foreground">Upload a ZIP of your project code, then start a session.</p>}
        </Card>
      </div>
    </AppShell>
  );
}
