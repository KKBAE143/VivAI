import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, Search, AlertTriangle } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { usePredictorRisk, usePredictorTopics, usePredictorTrends } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/college-predictor")({
  head: () => ({ meta: [{ title: "College Viva Predictor — CollgePro Navigator" }] }),
  component: CollegePredictor,
});

function CollegePredictor() {
  const [subjectInput, setSubjectInput] = useState("");
  const [subject, setSubject] = useState("");
  const { data: topics, isLoading } = usePredictorTopics(subject);
  const { data: trends } = usePredictorTrends();
  const { data: risk } = usePredictorRisk();

  return (
    <AppShell>
      <PageHeader title="College Viva Predictor" subtitle="Predicted exam topics from anonymized viva data across your entire college." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Search className="h-4 w-4" /> Topic Probability by Subject</h3>
          <div className="mt-3 flex gap-2">
            <input value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} placeholder="Subject (e.g. DBMS)" className="flex-1 rounded-lg border bg-background p-2 text-sm" />
            <button onClick={() => setSubject(subjectInput)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Predict</button>
          </div>
          {isLoading && <p className="mt-3 text-sm text-muted-foreground">Analyzing college data…</p>}
          <div className="mt-4 space-y-2">
            {(topics ?? []).map((t, i) => (
              <div key={i} className="rounded-lg border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{String(t.topic)}</span>
                  <span className="font-bold">{String(t.probability_pct)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${Number(t.probability_pct)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{String(t.frequency)} questions · {String(t.unique_students)} students asked</p>
              </div>
            ))}
            {subject && !isLoading && !(topics ?? []).length && (
              <p className="text-sm text-muted-foreground">Not enough college data for this subject yet — it improves as more students practice.</p>
            )}
          </div>
        </Card>
        <div className="space-y-5 lg:col-span-5">
          <Card>
            <h3 className="flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-4 w-4" /> Trending This Month</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(trends ?? []).slice(0, 12).map((t, i) => (
                <Badge key={i} tone={t.rising ? "success" : "muted"}>{String(t.topic)} · {String(t.recent_count)}</Badge>
              ))}
              {!(trends ?? []).length && <p className="text-sm text-muted-foreground">No trends yet.</p>}
            </div>
          </Card>
          <Card>
            <h3 className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="h-4 w-4" /> My Risk Zones</h3>
            <p className="mt-1 text-xs text-muted-foreground">Topics your college asks often, where YOU score low.</p>
            <div className="mt-3 space-y-2">
              {(risk ?? []).map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <span className="capitalize">{String(r.topic)}</span>
                  <Badge tone={r.risk === "high" ? "warning" : "muted"}>me: {String(r.my_avg_score)}% · asked {String(r.college_frequency)}x</Badge>
                </div>
              ))}
              {!(risk ?? []).length && <p className="text-sm text-muted-foreground">No risk zones detected — keep practicing!</p>}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
