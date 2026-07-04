import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GitMerge, Zap } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { api } from "@/lib/api";
import { usePresentations } from "@/lib/hooks";
import { useBridgeGaps, useBridgeHistory } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/presentation-bridge")({
  head: () => ({ meta: [{ title: "Presentation → Viva Bridge — CollgePro Navigator" }] }),
  component: PresentationBridge,
});

function PresentationBridge() {
  const { data: presentations } = usePresentations();
  const { data: history } = useBridgeHistory();
  const [selected, setSelected] = useState("");
  const { data: gaps, refetch } = useBridgeGaps(selected);
  const [generated, setGenerated] = useState<Record<string, unknown>[] | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api<{ gaps: Record<string, unknown>[] }>(`/api/advanced/bridge/${selected}/generate-questions`, { method: "POST" });
      setGenerated(res.gaps ?? []);
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    try {
      const session = await api<{ id: string }>(`/api/advanced/bridge/${selected}/launch-viva`, { method: "POST" });
      setLaunched(session.id);
    } finally {
      setBusy(false);
    }
  };

  const completed = (presentations ?? []).filter((p) => p.status === "Completed");

  return (
    <AppShell>
      <PageHeader title="Presentation → Viva Bridge" subtitle="Weak presentation topics become targeted viva practice — automatically." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <h3 className="flex items-center gap-2 text-base font-semibold"><GitMerge className="h-4 w-4" /> Past Presentations</h3>
          <div className="mt-3 space-y-2">
            {completed.map((p) => (
              <button key={String(p.id)} onClick={() => { setSelected(String(p.id)); setGenerated(null); setLaunched(null); refetch(); }}
                className={`w-full rounded-lg border p-2 text-left text-sm ${selected === p.id ? "border-primary" : ""}`}>
                <div className="font-medium">{String(p.session_type)} · {String(p.overall_score ?? "?")}%</div>
                <div className="text-xs text-muted-foreground">{String(p.created_at).slice(0, 10)}</div>
              </button>
            ))}
            {!completed.length && <p className="text-sm text-muted-foreground">Complete an AI presentation session first.</p>}
          </div>
        </Card>
        <Card className="lg:col-span-8">
          <h3 className="text-base font-semibold">Detected Gaps & Generated Questions</h3>
          {selected && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
                {(gaps ?? []).map((g, i) => (
                  <Badge key={i} tone={g.gap_severity === "high" ? "warning" : "muted"}>
                    {String(g.topic)} · {String(g.clarity_score)}%
                  </Badge>
                ))}
                {!(gaps ?? []).length && <p className="text-sm text-muted-foreground">No weak topics detected in this presentation.</p>}
              </div>
              {Boolean((gaps ?? []).length) && (
                <div className="mt-4 flex gap-2">
                  <button disabled={busy} onClick={generate} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                    {busy ? "Working…" : "Generate Viva Questions"}
                  </button>
                  {generated && (
                    <button disabled={busy} onClick={launch} className="flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-semibold">
                      <Zap className="h-4 w-4" /> Practice These Now
                    </button>
                  )}
                </div>
              )}
              {generated?.map((g, i) => (
                <div key={i} className="mt-3 rounded-lg border p-3 text-sm">
                  <div className="font-semibold capitalize">{String(g.topic)}</div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {((g.questions ?? []) as { question: string }[]).map((q, j) => (
                      <li key={j}>{q.question}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {launched && (
                <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
                  Focused viva session created!{" "}
                  <Link to="/ai-viva/session/$id" params={{ id: launched }} className="font-semibold text-primary underline">Start practicing →</Link>
                </p>
              )}
            </div>
          )}
          {!selected && <p className="mt-3 text-sm text-muted-foreground">Select a completed presentation on the left.</p>}
          {Boolean((history ?? []).length) && (
            <div className="mt-6 border-t pt-3">
              <h4 className="text-sm font-semibold">Bridge History</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {(history ?? []).slice(0, 10).map((h, i) => (
                  <Badge key={i} tone="muted">{String(h.topic)} ({String(h.gap_severity)})</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
