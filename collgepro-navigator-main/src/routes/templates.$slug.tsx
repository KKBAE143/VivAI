import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Share2, Check, X } from "lucide-react";
import { AppShell, Card, Badge } from "@/components/app-shell";

export const Route = createFileRoute("/templates/$slug")({
  head: () => ({ meta: [{ title: "Guide — CollgePro Navigator" }] }),
  component: TemplateDetail,
});

const titles: Record<string, string> = {
  pbl: "Project Based Learning (PBL)",
  "major-project": "Major Project — Final Year",
  "mini-project": "Mini Project",
  viva: "Viva Preparation",
};

function TemplateDetail() {
  const { slug } = Route.useParams();
  const title = titles[slug] ?? "Guide";
  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Link to="/templates" className="grid h-9 w-9 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <Badge tone="primary">Beginner friendly</Badge>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Complete guide · 8 min read</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium">
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background">
            <Download className="h-4 w-4" /> Checklist
          </button>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <Card>
            <h2 className="text-lg font-semibold">What is it?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              PBL is a teaching method where you learn by working on a real-world project related to your current semester subject.
              It's hands-on, team-based, and graded on innovation, implementation, presentation, and a final viva.
            </p>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Procedure timeline</h2>
            <ol className="mt-4 space-y-3">
              {[
                "Problem statement submission (Week 2-3)",
                "Team formation (Week 3)",
                "Literature review & planning (Week 4)",
                "Implementation (Week 5-10)",
                "Mid evaluation (Week 6-7)",
                "Final review & demo (Week 11-12)",
                "Submission (Week 12-13)",
              ].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-accent-foreground">
                    {i + 1}
                  </div>
                  <div className="pt-0.5 text-sm">{s}</div>
                </li>
              ))}
            </ol>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <h3 className="text-base font-semibold text-success">Do</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {["Start early — week 2 if possible", "Distribute work evenly across the team", "Document everything from day one", "Practice your viva with AI mock"].map((t) => (
                  <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="text-base font-semibold text-destructive">Don't</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {["Copy-paste from internet sources", "Leave everything for the last week", "Ignore team communication", "Skip the mid-evaluation prep"].map((t) => (
                  <li key={t} className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> {t}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
        <aside className="space-y-5">
          <Card>
            <h3 className="text-sm font-semibold">On this page</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {["What is it?", "Procedure timeline", "Do's and Don'ts", "Evaluation criteria", "Common questions"].map((s) => (
                <li key={s}><a href="#" className="text-muted-foreground hover:text-foreground">{s}</a></li>
              ))}
            </ul>
          </Card>
          <Card className="bg-primary text-primary-foreground">
            <h3 className="text-base font-semibold">Ready to practice?</h3>
            <p className="mt-1 text-xs text-primary-foreground/85">Run an AI mock viva for this guide.</p>
            <Link to="/ai-viva/new" className="mt-4 block rounded-xl bg-primary-foreground px-4 py-2.5 text-center text-sm font-semibold text-primary">
              Start Mock Viva
            </Link>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}