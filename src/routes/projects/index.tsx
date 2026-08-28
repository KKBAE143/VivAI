import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, Filter, MoreHorizontal, FolderKanban } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { DataPagination } from "@/components/data-pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/hooks";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "My Projects — VivAI" },
      { name: "description", content: "Manage your PBL, Major and Mini projects in one place." },
    ],
  }),
  component: Projects,
});

const FILTERS = ["All", "PBL", "Major", "Mini", "Completed"] as const;
const PAGE_SIZE = 6;

function Projects() {
  useRequireAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const typeFilter =
    filter === "PBL" || filter === "Major" || filter === "Mini" ? filter : undefined;
  const { data, isLoading, error, refetch } = useProjects(typeFilter);

  let projects = data ?? [];
  if (filter === "Completed") projects = projects.filter((p) => p.status === "Completed");
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    projects = projects.filter(
      (p) =>
        String(p.title ?? "")
          .toLowerCase()
          .includes(q) ||
        String(p.subject ?? "")
          .toLowerCase()
          .includes(q),
    );
  }

  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleProjects = projects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              My Projects
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage your college coursework, mini projects, and major projects.
            </p>
          </div>
          <Link
            to="/projects/new"
            className="apple-glass-btn-primary px-3.5 py-2 text-xs sm:text-sm font-bold no-underline"
          >
            <Plus className="h-4 w-4" /> New Project
          </Link>
        </div>

        {/* Main Content Card */}
        <div className="apple-glass-card p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="apple-segmented-track p-1">
                {FILTERS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setFilter(t);
                      setPage(1);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      filter === t
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-border bg-black/5 dark:bg-white/5 px-3 py-1 text-xs">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    placeholder="Search projects…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-36 bg-transparent focus:outline-none text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-4">
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
                description={
                  search || filter !== "All"
                    ? "Try a different filter or search term."
                    : "Create your first project to get started."
                }
              />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-medium text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Project</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 font-medium">Progress</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Deadline</th>
                      <th className="py-2 pr-3 font-medium">Tech Stack</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleProjects.map((p) => {
                      const progress = Number(p.progress ?? 0);
                      const tech = Array.isArray(p.tech_stack)
                        ? (p.tech_stack as string[])
                        : typeof p.tech_stack === "string" && p.tech_stack
                          ? (p.tech_stack as string).split(",").map((s) => s.trim())
                          : [];
                      return (
                        <tr
                          key={String(p.id)}
                          className="group hover:bg-secondary/30 transition-colors"
                        >
                          <td className="py-2.5 pr-3">
                            <Link
                              to="/projects/$id"
                              params={{ id: String(p.id) }}
                              className="font-semibold text-foreground hover:text-primary transition-colors block truncate max-w-[200px]"
                            >
                              {String(p.title)}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                            {String(p.project_type ?? "General")}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-muted-foreground">{progress}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Badge
                              tone={
                                p.status === "Completed"
                                  ? "success"
                                  : p.status === "In Progress"
                                    ? "primary"
                                    : "muted"
                              }
                            >
                              {String(p.status ?? "Planning")}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-3 text-[11px] text-muted-foreground">
                            {p.deadline ? String(p.deadline).slice(0, 10) : "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {tech.slice(0, 3).map((t) => (
                                <Badge key={t} tone="muted">
                                  {t}
                                </Badge>
                              ))}
                              {tech.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{tech.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            <Link
                              to="/projects/$id"
                              params={{ id: String(p.id) }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {projects.length > 0 && (
            <DataPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={projects.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemName="projects"
              className="mt-2 pt-2"
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
