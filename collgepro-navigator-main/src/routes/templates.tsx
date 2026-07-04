import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Sparkles, Mic, ChevronRight } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates & Guidelines — CollgePro Navigator" },
      { name: "description", content: "Learn what PBL, Major and Mini projects are, and how to prepare for vivas." },
    ],
  }),
  component: Templates,
});

const guides = [
  { slug: "pbl", title: "What is PBL?", desc: "Project Based Learning — full procedure, do's, don'ts.", tag: "Beginner", icon: BookOpen },
  { slug: "major-project", title: "Major Project Guide", desc: "Final-year capstone, from topic selection to defense.", tag: "Advanced", icon: GraduationCap },
  { slug: "mini-project", title: "Mini Project Guide", desc: "Short scope, big learning. Pick a tech and ship it.", tag: "Intermediate", icon: Sparkles },
  { slug: "viva", title: "Viva Preparation", desc: "Internal vs external, common questions, calm-mind tips.", tag: "Essential", icon: Mic },
];

function Templates() {
  return (
    <AppShell>
      <PageHeader title="Templates & Guidelines" subtitle="Everything you need to understand and ace your academic milestones." />
      <div className="grid gap-5 md:grid-cols-2">
        {guides.map((g) => {
          const I = g.icon;
          return (
            <Link key={g.slug} to="/templates/$slug" params={{ slug: g.slug }}>
              <Card className="h-full transition-transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                    <I className="h-5 w-5" />
                  </div>
                  <Badge tone="primary">{g.tag}</Badge>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{g.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{g.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                  Read guide <ChevronRight className="h-4 w-4" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}