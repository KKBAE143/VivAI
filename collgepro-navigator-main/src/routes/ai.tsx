import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Mic,
  MonitorSmartphone,
  Code2,
  GitMerge,
  Users,
  GraduationCap,
  Grid3X3,
  TrendingUp,
  Video,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "AI Hub — CollgePro Navigator" },
      { name: "description", content: "All your AI study tools in one place: mock viva, presentation practice, code-aware viva, presentation-to-viva bridge, team viva, faculty simulation, weakness heatmap, college viva predictor and real-time sentiment coaching." },
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

const tools = [
  { to: "/advanced/viva-code-aware", title: "Code-Aware Viva", desc: "AI reads your source code, asks implementation-specific questions.", icon: Code2, tag: "New" },
  { to: "/advanced/presentation-bridge", title: "Presentation → Viva Bridge", desc: "Turn weak presentation topics into targeted viva practice.", icon: GitMerge, tag: "New" },
  { to: "/advanced/viva-team", title: "Team Viva Mode", desc: "Real-time group viva — race to answer, team scores.", icon: Users, tag: "New" },
  { to: "/advanced/faculty-sim", title: "Faculty Simulation", desc: "Practice against an AI persona of your actual professor.", icon: GraduationCap, tag: "New" },
  { to: "/advanced/weakness-heatmap", title: "Weakness Heatmap", desc: "Per-topic weak spots aggregated across every session.", icon: Grid3X3, tag: "New" },
  { to: "/advanced/college-predictor", title: "College Viva Predictor", desc: "Predict exam topics from your whole college's viva history.", icon: TrendingUp, tag: "New" },
  { to: "/advanced/sentiment-analysis", title: "Real-Time Sentiment", desc: "Live webcam coaching on confidence, pace and eye contact.", icon: Video, tag: "New" },
] as const;

function AIHub() {
  return (
    <AppShell>
      <PageHeader
        title="AI Hub"
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
            <h3 className="text-base font-semibold">Advanced AI features</h3>
            <p className="mt-1 text-xs text-muted-foreground">Unique tools that connect your code, presentations and vivas.</p>
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