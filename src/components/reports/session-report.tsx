import { Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer } from "recharts";
import type { SessionReport } from "@/lib/types";

export function SessionReport({ report }: { report: SessionReport }) {
  // Defensive: report is LLM-shaped JSON persisted by the backend. It should
  // always match this shape (report_service._validate_report guarantees it),
  // but a future schema version bump or a corrupted row must never crash this
  // page — degrade to "—" / empty sections instead.
  const dimensions = report.scores?.dimensions ?? [];
  const data = dimensions.map((dimension) => ({ label: dimension.label, score: dimension.score }));
  const overall = report.scores?.overall;
  const sections = report.sections ?? [];
  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence-based report</p><h2 className="mt-1 text-2xl font-bold">{overall != null ? `${overall}% overall` : "Score unavailable"}</h2></div>
          {report.framework && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{report.framework.replaceAll("_", " ")}</span>}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.executive_summary}</p>
      </section>
      {dimensions.length > 0 && <section className="grid gap-5 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] md:grid-cols-2">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data}><PolarGrid /><PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} /><Radar dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} /></RadarChart></ResponsiveContainer></div>
        <div className="space-y-3">{dimensions.map((dimension) => <div key={dimension.id}><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{dimension.label} <span className="text-xs text-muted-foreground">{Math.round(dimension.weight * 100)}%</span></span><span>{dimension.score}%</span></div><div className="mt-1 h-2 overflow-hidden rounded bg-secondary"><div className="h-full rounded bg-primary" style={{ width: `${dimension.score}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{dimension.explanation}</p></div>)}</div>
      </section>}
      <section className="grid gap-4 md:grid-cols-2">{sections.map((section) => <div key={section.id} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]"><h3 className="font-semibold capitalize">{section.id.replaceAll("_", " ")}</h3>{section.status === "not_observed" ? <p className="mt-2 text-sm text-muted-foreground">{section.reason}</p> : (section.findings ?? []).length > 0 ? <ul className="mt-3 space-y-2 text-sm">{(section.findings ?? []).map((finding, index) => <li key={index} className="rounded-xl bg-secondary p-3"><span className="font-medium capitalize">{finding.kind}</span> · {finding.text}{finding.quote ? <p className="mt-1 text-xs text-muted-foreground">Evidence: “{finding.quote}”</p> : null}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No confirmed findings.</p>}</div>)}</section>
    </div>
  );
}
