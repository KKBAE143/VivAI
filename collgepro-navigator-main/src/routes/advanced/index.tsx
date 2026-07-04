import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, GitMerge, Users, GraduationCap, Grid3X3, TrendingUp, Video, Sparkles } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";

export const Route = createFileRoute("/advanced/")({
  head: () => ({ meta: [{ title: "Advanced AI Features — CollgePro Navigator" }] }),
  component: AdvancedHub,
});

const features = [
  { to: "/advanced/viva-code-aware", icon: Code2, title: "Code-Aware Viva", desc: "The AI reads your actual source code and asks implementation-specific questions.", tag: "Killer Feature" },
  { to: "/advanced/presentation-bridge", icon: GitMerge, title: "Presentation → Viva Bridge", desc: "Turn weak presentation topics into targeted viva practice questions.", tag: "Smart Loop" },
  { to: "/advanced/viva-team", icon: Users, title: "Team Viva Mode", desc: "Real-time group viva — race to answer, get individual and team scores.", tag: "Real-time" },
  { to: "/advanced/faculty-sim", icon: GraduationCap, title: "Faculty Simulation", desc: "Practice against an AI persona of your actual professor.", tag: "Personalized" },
  { to: "/advanced/weakness-heatmap", icon: Grid3X3, title: "Weakness Heatmap", desc: "Your weak topics aggregated across every viva session.", tag: "Analytics" },
  { to: "/advanced/college-predictor", icon: TrendingUp, title: "College Viva Predictor", desc: "Predict likely exam topics from your whole college's viva history.", tag: "Network Effect" },
  { to: "/advanced/sentiment-analysis", icon: Video, title: "Real-Time Sentiment", desc: "Live webcam coaching on confidence, pace and eye contact.", tag: "Multimodal" },
];

function AdvancedHub() {
  return (
    <AppShell>
      <PageHeader title="Advanced AI Features" subtitle="Unique tools that connect your project content, presentations and vivas." />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Link key={f.to} to={f.to}>
            <Card className="h-full transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <f.icon className="h-5 w-5 text-primary" />
                <Badge tone="muted">{f.tag}</Badge>
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          </Link>
        ))}
        <Card className="h-full bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
          <h3 className="mt-4 text-base font-semibold">All connected</h3>
          <p className="mt-1 text-sm text-primary-foreground/90">
            Your project content feeds AI vivas, presentation feedback and team collaboration — in one workflow.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
