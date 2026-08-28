import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  GraduationCap,
  Sparkles,
  Mic,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { useTemplates } from "@/lib/hooks";

export const Route = createFileRoute("/templates/")({
  head: () => ({
    meta: [
      { title: "Templates & Guidelines — VivAI" },
      {
        name: "description",
        content: "Learn what PBL, Major and Mini projects are, and how to prepare for vivas.",
      },
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

const PAGE_SIZE = 4;

function Templates() {
  const { data: templates, isLoading, isError } = useTemplates();
  const [page, setPage] = useState(1);

  const allTemplates = templates ?? [];
  const totalPages = Math.max(1, Math.ceil(allTemplates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleTemplates = allTemplates.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Templates & Guidelines
            </h1>
            <p className="text-xs text-muted-foreground">
              Everything you need to understand and ace your academic milestones.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-3 md:grid-cols-2 flex-1">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="h-32 animate-pulse bg-secondary">
                <span className="sr-only">Loading</span>
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <Card className="text-xs text-destructive p-4">
            Could not load guides. Please try again shortly.
          </Card>
        )}

        {!isLoading && !isError && (
          <Card className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
            <div className="grid gap-3 md:grid-cols-2">
              {visibleTemplates.map((g) => {
                const I = categoryIcon[g.category] ?? BookOpen;
                return (
                  <Link key={g.slug} to="/templates/$slug" params={{ slug: g.slug }}>
                    <div className="rounded-xl border border-border p-3.5 transition-all hover:border-primary bg-card/60 flex flex-col justify-between h-full">
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                            <I className="h-4 w-4" />
                          </div>
                          <Badge tone="primary">{g.category}</Badge>
                        </div>
                        <h3 className="mt-2.5 text-sm font-semibold truncate">{g.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {g.summary}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary pt-2 border-t border-border/40">
                        Read guide <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            {allTemplates.length > 0 && (
              <DataPagination
                page={safePage}
                totalPages={totalPages}
                totalItems={allTemplates.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="guides"
                className="mt-2 pt-2"
              />
            )}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
