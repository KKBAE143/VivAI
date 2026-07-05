import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Sparkles, Mic, ChevronRight, type LucideIcon } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { useTemplates } from "@/lib/hooks";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates & Guidelines — CollgePro Navigator" },
      { name: "description", content: "Learn what PBL, Major and Mini projects are, and how to prepare for vivas." },
    ],
  }),
  component: Templates,
});

const categoryIcon: Record<string, LucideIcon> = {
  PBL: BookOpen,
  Major: GraduationCap,
  Mini: Sparkles,
  Viva: Mic,
};

function Templates() {
  const { data: templates, isLoading, isError } = useTemplates();

  return (
    <AppShell>
      <PageHeader title="Templates & Guidelines" subtitle="Everything you need to understand and ace your academic milestones." />

      {isLoading && (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse bg-secondary">
              <span className="sr-only">Loading</span>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card className="text-sm text-destructive">Could not load guides. Please try again shortly.</Card>
      )}

      {!isLoading && !isError && (
        <div className="grid gap-5 md:grid-cols-2">
          {(templates ?? []).map((g) => {
            const I = categoryIcon[g.category] ?? BookOpen;
            return (
              <Link key={g.slug} to="/templates/$slug" params={{ slug: g.slug }}>
                <Card className="h-full transition-transform hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                      <I className="h-5 w-5" />
                    </div>
                    <Badge tone="primary">{g.category}</Badge>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{g.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{g.summary}</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                    Read guide <ChevronRight className="h-4 w-4" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
