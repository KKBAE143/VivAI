import { Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer } from "recharts";
import { CheckCircle2, AlertTriangle, Lightbulb, Target, BookOpen, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { SessionReport } from "@/lib/types";

function Panel({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof CheckCircle2;
  title: string;
  tone: "success" | "warning" | "primary" | "muted";
  children: ReactNode;
}) {
  const toneCls = {
    success: "text-success",
    warning: "text-warning",
    primary: "text-primary",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${toneCls}`} />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function SessionReport({ report }: { report: SessionReport }) {
  // Defensive: report is LLM-shaped JSON persisted by the backend. It should
  // always match this shape (report_service._validate_report guarantees it),
  // but a future schema version bump or a corrupted row must never crash this
  // page — degrade to "—" / empty sections instead.
  const dimensions = report.scores?.dimensions ?? [];
  const data = dimensions.map((dimension) => ({ label: dimension.label, score: dimension.score }));
  const overall = report.scores?.overall;
  const sections = report.sections ?? [];
  const strengths = report.strengths ?? [];
  // v2 reports carry `weaknesses`; older (v1) reports only have `improvements`
  // with the same meaning — prefer the newer field, fall back to the old one.
  const weaknesses = report.weaknesses?.length ? report.weaknesses : (report.improvements ?? []);
  const recommendations = report.recommendations ?? [];
  const practicePlan = report.practice_plan ?? [];
  const resources = report.resources ?? [];
  const timeline = report.timeline ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Evidence-based report
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              {overall != null ? `${overall}% overall` : "Score unavailable"}
            </h2>
          </div>
          {report.framework && (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
              {report.framework.replaceAll("_", " ")}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {report.executive_summary}
        </p>
      </section>

      {dimensions.length > 0 && (
        <section className="grid gap-5 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] md:grid-cols-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                <Radar
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.25}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {dimensions.map((dimension) => (
              <div key={dimension.id}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {dimension.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      {Math.round(dimension.weight * 100)}%
                    </span>
                  </span>
                  <span>{dimension.score}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-secondary">
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${dimension.score}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{dimension.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          {strengths.length > 0 && (
            <Panel icon={CheckCircle2} title="Strengths" tone="success">
              <ul className="space-y-2 text-sm">
                {strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {weaknesses.length > 0 && (
            <Panel icon={AlertTriangle} title="Weaknesses" tone="warning">
              <ul className="space-y-2 text-sm">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>
      )}

      {recommendations.length > 0 && (
        <Panel icon={Lightbulb} title="How to improve" tone="primary">
          <ul className="space-y-2.5 text-sm">
            {recommendations.map((r, i) => (
              <li key={i} className="rounded-xl bg-secondary p-3">
                {r.dimension && (
                  <span className="mb-1 inline-block rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {r.dimension.replaceAll("_", " ")}
                  </span>
                )}
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {report.industry_expectations && (
        <Panel icon={TrendingUp} title="Industry expectations" tone="muted">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {report.industry_expectations}
          </p>
        </Panel>
      )}

      {(practicePlan.length > 0 || resources.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          {practicePlan.length > 0 && (
            <Panel icon={Target} title="Action plan" tone="primary">
              <ul className="space-y-2.5 text-sm">
                {practicePlan.map((p, i) => (
                  <li key={i} className="flex gap-3 rounded-xl bg-secondary p-3">
                    <span className="shrink-0 text-xs font-semibold text-primary">{p.day}</span>
                    <span>{p.action}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {resources.length > 0 && (
            <Panel icon={BookOpen} title="Resources to review" tone="muted">
              <ul className="space-y-2.5 text-sm">
                {resources.map((r, i) => (
                  <li key={i} className="rounded-xl bg-secondary p-3">
                    <span className="font-medium">{r.topic}</span>
                    {r.why && <p className="mt-0.5 text-xs text-muted-foreground">{r.why}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section.id} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold capitalize">{section.id.replaceAll("_", " ")}</h3>
            {section.status === "not_observed" ? (
              <p className="mt-2 text-sm text-muted-foreground">{section.reason}</p>
            ) : (section.findings ?? []).length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {(section.findings ?? []).map((finding, index) => (
                  <li key={index} className="rounded-xl bg-secondary p-3">
                    <span className="font-medium capitalize">{finding.kind}</span> · {finding.text}
                    {finding.quote ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Evidence: “{finding.quote}”
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No confirmed findings.</p>
            )}
          </div>
        ))}
      </section>

      {timeline.length > 0 && (
        <Panel icon={Target} title="Session timeline" tone="muted">
          <ol className="space-y-2 border-l border-border pl-4">
            {timeline
              .slice()
              .sort((a, b) => a.ts_ms - b.ts_ms)
              .map((item, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-primary" />
                  <span className="text-xs text-muted-foreground">
                    {Math.floor(item.ts_ms / 60000)}:
                    {String(Math.floor((item.ts_ms % 60000) / 1000)).padStart(2, "0")}
                  </span>{" "}
                  {item.label}
                </li>
              ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}
