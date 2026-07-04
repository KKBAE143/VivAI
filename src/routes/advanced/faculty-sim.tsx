import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Star, Play, Square } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/hooks";
import { useFacultyProfiles } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/faculty-sim")({
  head: () => ({ meta: [{ title: "Faculty Simulation — CollgePro Navigator" }] }),
  component: FacultySim,
});

function FacultySim() {
  const { data: profiles } = useFacultyProfiles();
  const [form, setForm] = useState({ name: "", subjects: "", style_tags: "", known_patterns: "", difficulty_level: "Medium" });
  const createProfile = useApiMutation(
    () => api("/api/advanced/faculty-sim/profiles", {
      body: {
        name: form.name,
        subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean),
        style_tags: form.style_tags.split(",").map((s) => s.trim()).filter(Boolean),
        known_patterns: form.known_patterns,
        difficulty_level: form.difficulty_level,
      },
    }),
    ["faculty-profiles"],
  );

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<{ question: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [rating, setRating] = useState(4);
  const [busy, setBusy] = useState(false);

  const startSim = async (facultyId: string) => {
    setBusy(true);
    try {
      const session = await api<{ id: string }>(`/api/advanced/faculty-sim/${facultyId}/session`, { body: {} });
      setSessionId(session.id);
      setSummary(null);
      setQuestion(await api(`/api/advanced/faculty-sim/sessions/${session.id}/start`, { method: "POST" }));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await api<{ evaluation: { score: number; feedback: string }; next_question: { question: string } }>(
        `/api/advanced/faculty-sim/sessions/${sessionId}/answer`, { body: { answer } });
      setFeedback(`Score ${res.evaluation.score}/100 — ${res.evaluation.feedback}`);
      setQuestion(res.next_question);
      setAnswer("");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      setSummary(await api(`/api/advanced/faculty-sim/sessions/${sessionId}/end`, { body: { accuracy_rating: rating } }));
      setSessionId(null);
      setQuestion(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Faculty Simulation" subtitle="Practice against an AI persona of your actual professor — crowd-sourced by your college." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <h3 className="flex items-center gap-2 text-base font-semibold"><GraduationCap className="h-4 w-4" /> Faculty Profiles</h3>
          <div className="mt-3 space-y-2">
            {(profiles ?? []).map((p) => (
              <div key={String(p.id)} className="rounded-lg border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{String(p.name)}</span>
                  <span className="flex items-center gap-1 text-xs"><Star className="h-3 w-3" /> {String(p.avg_rating)} ({String(p.total_ratings)})</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {((p.style_tags ?? []) as string[]).map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
                </div>
                <button disabled={busy} onClick={() => startSim(String(p.id))} className="mt-2 flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  <Play className="h-3 w-3" /> Simulate
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t pt-3">
            <h4 className="text-sm font-semibold">Add a professor</h4>
            <input placeholder="Name (e.g. Prof. Sharma)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
            <input placeholder="Subjects (comma separated)" value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
            <input placeholder="Style tags (strict, gives-hints…)" value={form.style_tags} onChange={(e) => setForm({ ...form, style_tags: e.target.value })} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
            <textarea placeholder="Known patterns (always starts with…)" value={form.known_patterns} onChange={(e) => setForm({ ...form, known_patterns: e.target.value })} rows={2} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
            <button disabled={!form.name || createProfile.isPending} onClick={() => createProfile.mutate(undefined)} className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold">Save Profile</button>
          </div>
        </Card>
        <Card className="lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Simulation</h3>
            {sessionId && (
              <div className="flex items-center gap-2">
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="rounded-lg border bg-background p-1 text-xs">
                  {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>Accuracy: {r}/5</option>)}
                </select>
                <button disabled={busy} onClick={end} className="flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-semibold"><Square className="h-3 w-3" /> End & Rate</button>
              </div>
            )}
          </div>
          {busy && <p className="mt-3 text-sm text-muted-foreground">The professor is thinking…</p>}
          {question && (
            <div className="mt-4">
              <p className="rounded-lg bg-muted p-3 text-sm font-medium">{question.question}</p>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Answer in character…" className="mt-3 w-full rounded-lg border bg-background p-2 text-sm" />
              <button disabled={busy || !answer.trim()} onClick={submit} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Submit Answer</button>
              {feedback && <p className="mt-3 rounded-lg border p-2 text-xs">{feedback}</p>}
            </div>
          )}
          {summary && (
            <div className="mt-4 rounded-lg border p-4 text-sm">
              <div className="text-2xl font-bold">{String(summary.overall_score)}%</div>
              <p className="mt-1">{String(summary.summary)}</p>
            </div>
          )}
          {!question && !summary && <p className="mt-4 text-sm text-muted-foreground">Pick a professor to start a hyper-personalized mock viva.</p>}
        </Card>
      </div>
    </AppShell>
  );
}
