import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Mic,
  MonitorSmartphone,
  Code2,
  Users,
  Grid3X3,
  Video,
  Sparkles,
  ArrowRight,
  Timer,
  Gauge,
} from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "AI Hub — VivAI" },
      {
        name: "description",
        content:
          "All your AI study tools in one place: mock viva, presentation practice, code-aware viva, team viva, weakness heatmap and real-time sentiment coaching.",
      },
    ],
  }),
  component: AIHub,
});

const hero = [
  {
    to: "/ai-viva",
    title: "AI Mock Viva",
    desc: "Voice-led oral practice. Instant scoring, follow-ups, and Hinglish support.",
    icon: Mic,
    tag: "Signature",
  },
  {
    to: "/ai-presentation",
    title: "AI Presentation Mock",
    desc: "Present live to AI faculty. Real-time feedback on clarity, pace, and coverage.",
    icon: MonitorSmartphone,
    tag: "Signature",
  },
] as const;

const essentials = [
  {
    to: "/pitch-drill",
    title: "90-Second Pitch Drill",
    desc: "Nail the elevator pitch examiners ask for first. Timed, AI-scored.",
    icon: Timer,
    tag: "New",
  },
  {
    to: "/readiness",
    title: "Defense Readiness",
    desc: "See how ready you are to defend, and exactly what to fix next.",
    icon: Gauge,
    tag: "New",
  },
] as const;

const tools = [
  {
    to: "/advanced/viva-code-aware",
    title: "Code-Aware Viva",
    desc: "Upload a ZIP, then the same live viva layout as Mock Viva — examiner already knows your code.",
    icon: Code2,
    tag: "New",
  },
  {
    to: "/advanced/viva-team",
    title: "Team Viva Mode",
    desc: "Real-time group viva — race to answer, team scores.",
    icon: Users,
    tag: "New",
  },
  {
    to: "/advanced/weakness-heatmap",
    title: "Weakness Heatmap",
    desc: "Per-topic weak spots aggregated across every session.",
    icon: Grid3X3,
    tag: "New",
  },
  {
    to: "/advanced/sentiment-analysis",
    title: "AI Communication Coach",
    desc: "Live role-play for interviews, GD, pitch & more with real-time delivery coaching.",
    icon: Video,
    tag: "New",
  },
] as const;

function AIHub() {
  return (
    <AppShell>
      <PageHeader
        title="AI Tools"
        subtitle="Every AI feature that helps you learn, build, and defend your work — one tap away."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {hero.map((h) => {
          const I = h.icon;
          return (
            <Link
              key={h.to}
              to={h.to}
              className="group relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
                  {h.tag}
                </span>
                <Sparkles className="h-4 w-4 opacity-80" />
              </div>
              <div className="mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-primary-foreground/15">
                <I className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight">{h.title}</h2>
              <p className="mt-2 max-w-sm text-sm text-primary-foreground/85">{h.desc}</p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2.5 text-sm font-semibold text-primary">
                Open <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Prep essentials</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The everyday tools that get you defense-ready.
            </p>
          </div>
          <Badge tone="primary">3 new</Badge>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {essentials.map((t) => {
            const I = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="group block rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-primary-soft/40"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-accent-foreground">
                    <I className="h-5 w-5" />
                  </div>
                  <Badge tone="success">{t.tag}</Badge>
                </div>
                <div className="mt-4 font-semibold">{t.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Advanced AI features</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Unique tools that connect your code, presentations and vivas.
            </p>
          </div>
          <Badge tone="primary">7 new</Badge>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => {
            const I = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="group block rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-primary-soft/40"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-accent-foreground">
                    <I className="h-5 w-5" />
                  </div>
                  <Badge tone="success">{t.tag}</Badge>
                </div>
                <div className="mt-4 font-semibold">{t.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Try it <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}
