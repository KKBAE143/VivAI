import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Grid3X3, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useProjects, useApiMutation } from "@/lib/hooks";
import { useHeatmap } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/weakness-heatmap")({
  head: () => ({ meta: [{ title: "Weakness Heatmap — CollgePro Navigator" }] }),
  component: WeaknessHeatmap,
});

function cellColor(score: number) {
  if (score < 40) return "bg-destructive/80 text-destructive-foreground";
  if (score < 60) return "bg-destructive/40";
  if (score < 75) return "bg-yellow-500/30";
  return "bg-green-500/20";
}

function WeaknessHeatmap() {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState<string>("");
  const { data: heatmap, refetch, isLoading } = useHeatmap(projectId || undefined);
  const [detail, setDetail] = useState<{ topic: string; items: Record<string, unknown>[] } | null>(null);
  const refresh = useApiMutation(() => api("/api/advanced/heatmap/refresh", { method: "POST" }), ["heatmap"]);

  const openDetail = async (topic: string) => {
    const items = await api<Record<string, unknown>[]>(
      `/api/advanced/heatmap/${projectId || "overall"}/detailed/${encodeURIComponent(topic)}`,
    );
    setDetail({ topic, items });
  };

  const TrendIcon = ({ trend }: { trend: string }) =>
    trend === "improving" ? <TrendingUp className="h-3 w-3" /> : trend === "declining" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />;

  return (
    <AppShell>
      <PageHeader title="Viva Weakness Heatmap" subtitle="Your weak topics, aggregated across every viva session you've taken." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="rounded-lg border bg-background p-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {(projects ?? []).map((p) => (
            <option key={String(p.id)} value={String(p.id)}>{String(p.title)}</option>
          ))}
        </select>
        <button onClick={() => { refresh.mutate(undefined); refetch(); }} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" /> Refresh Analysis
        </button>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Grid3X3 className="h-4 w-4" /> Topics (weakest first)</h3>
          {isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
            {(heatmap ?? []).map((h) => (
              <button key={h.topic} onClick={() => openDetail(h.topic)} className={`rounded-lg p-3 text-left text-sm ${cellColor(h.avg_score)}`}>
                <div className="font-semibold capitalize">{h.topic}</div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span>{h.avg_score}/100 · {h.question_count} Qs</span>
                  <TrendIcon trend={h.trend_direction} />
                </div>
              </button>
            ))}
          </div>
          {!isLoading && !(heatmap ?? []).length && (
            <p className="mt-4 text-sm text-muted-foreground">No data yet — complete a few AI viva sessions first.</p>
          )}
        </Card>
        <Card className="lg:col-span-5">
          <h3 className="text-base font-semibold">Topic History</h3>
          {detail ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold capitalize">{detail.topic}</p>
              {detail.items.map((q, i) => (
                <div key={i} className="rounded-lg border p-2 text-xs">
                  <p className="font-medium">{String(q.question_text)}</p>
                  <p className="mt-1 text-muted-foreground">Score: {String(q.score)} — {String(q.feedback ?? "")}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Click a weak topic to see the full question history and feedback.</p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
