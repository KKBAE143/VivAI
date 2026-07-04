import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, Filter, MoreHorizontal, FolderKanban } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/hooks";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "My Projects — CollgePro Navigator" },
      { name: "description", content: "Manage your PBL, Major and Mini projects in one place." },
    ],
  }),
  component: Projects,
});

const FILTERS = ["All", "PBL", "Major", "Mini", "Completed"] as const;

function Projects() {
  useRequireAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const typeFilter = filter === "PBL" || filter === "Major" || filter === "Mini" ? filter : undefined;
  const { data, isLoading, error, refetch } = useProjects(typeFilter);

  let projects = data ?? [];
  if (filter === "Completed") projects = projects.filter((p) => p.status === "Completed");
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    projects = projects.filter(
      (p) => String(p.title ?? "").toLowerCase().includes(q) || String(p.subject ?? "").toLowerCase().includes(q),
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="My Projects"
        subtitle="Manage your PBL, Major, and Mini projects."
        action={
          <Link to="/projects/new" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95">
            <Plus className="h-4 w-4" /> New Project
          </Link>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
            {FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search projects"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-40 bg-transparent focus:outline-none"
              />
            </div>
            <button className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
              <Filter className="h-3.5 w-3.5" /> Filter
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="mt-5">
            <TableSkeleton rows={5} />
          </div>
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Could not load projects"}
            onRetry={() => void refetch()}
          />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects found"
            description={search || filter !== "All" ? "Try a different filter or search term." : "Create your first project to get started."}
          />
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Project</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Progress</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Deadline</th>
                  <th className="py-2 pr-3 font-medium">Tech Stack</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const progress = Number(p.progress ?? 0);
                  const status = String(p.status ?? "In Progress");
                  const type = String(p.type ?? "PBL");
                  const tech = ((p.tech_stack as string[] | null | undefined) ?? []).slice(0, 3);
                  return (
                    <tr key={String(p.id)} className="border-b border-border last:border-0 hover:bg-secondary/40">
                      <td className="py-3.5 pr-3">
                        <Link to="/projects/$id" params={{ id: String(p.id) }} className="block">
                          <div className="font-semibold">{String(p.title)}</div>
                          <div className="text-xs text-muted-foreground">{String(p.subject ?? "—")}</div>
                        </Link>
                      </td>
                      <td className="py-3.5 pr-3">
                        <Badge tone={type === "Major" ? "primary" : type === "Mini" ? "muted" : "warning"}>{type}</Badge>
                      </td>
                      <td className="py-3.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full ${progress === 100 ? "bg-success" : "bg-primary"}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">{progress}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-3">
                        <Badge tone={status === "Completed" ? "success" : status === "Under Review" ? "warning" : "primary"}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" /> {status}
                        </Badge>
                      </td>
                      <td className="py-3.5 pr-3 text-xs text-muted-foreground">
                        {p.deadline ? String(p.deadline).slice(0, 10) : "—"}
                      </td>
                      <td className="py-3.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {tech.length ? tech.map((t) => <Badge key={t} tone="muted">{t}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="py-3.5 text-right">
                        <button aria-label="More" className="text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="border border-dashed border-border bg-transparent shadow-none">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
            <FolderKanban className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-base font-semibold">Start something new</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Spin up a new PBL, Major, or Mini project with templates, milestones and AI-ready viva prep.
          </p>
          <Link to="/projects/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background">
            <Plus className="h-4 w-4" /> Create Project
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}