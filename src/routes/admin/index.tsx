import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users, Activity, BarChart3, Download, Share2, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useRequireAuth, useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/hooks";
import {
  useInstitutionDashboard,
  useInstitutionStudents,
  useInstitutionReadinessReport,
  useInstitutionWeakTopics,
  useInstitutionInvite,
} from "@/lib/hooks-features";
import { api } from "@/lib/api";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Institution Admin — VivAI" },
      { name: "description", content: "Cohort readiness dashboard for institutional administrators." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { ready, isLoading: authLoading } = useRequireAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const role = profile?.role ?? "student";
  const isBlocked = !authLoading && ready && role === "student";

  // Redirect non-admins.
  //
  // This MUST be an effect with an unconditional early return kept below every
  // hook. It used to `navigate()` and `return null` right here — above the
  // eight hooks that follow. The first render (auth still loading) ran all
  // eleven hooks; once auth resolved for a student the early return fired after
  // three, and React — which tracks hooks by call index — threw "Rendered fewer
  // hooks than expected". Every student who opened /admin crashed the app.
  useEffect(() => {
    if (isBlocked) navigate({ to: "/" });
  }, [isBlocked, navigate]);

  const dashboard = useInstitutionDashboard();
  const [studentPage, setStudentPage] = useState(1);
  const [branchFilter, setBranchFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const students = useInstitutionStudents(studentPage, branchFilter || undefined, yearFilter || undefined);
  const readinessReport = useInstitutionReadinessReport();
  const weakTopics = useInstitutionWeakTopics();
  const invite = useInstitutionInvite();

  // Safe here: every hook above has already run, so the hook count is identical
  // on every render regardless of which branch we take below.
  if (isBlocked) return null;

  if (dashboard.isLoading) {
    return (
      <AppShell>
        <PageHeader title="Institution Admin" subtitle="Loading cohort data…" />
        <div className="grid gap-5 md:grid-cols-4">
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
        </div>
      </AppShell>
    );
  }

  if (dashboard.error) {
    return (
      <AppShell>
        <ErrorState
          message={dashboard.error instanceof Error ? dashboard.error.message : "Failed to load institution data"}
          onRetry={() => void dashboard.refetch()}
        />
      </AppShell>
    );
  }

  const d = dashboard.data;
  if (!d) return null;

  const handleExport = async () => {
    try {
      const res = await api<string>("/api/institution/export");
      // The API returns CSV — open as blob download
      const blob = new Blob([res], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vivai_readiness_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // handled by api layer
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={`${d.institution.name} — Admin Dashboard`}
        subtitle={`${d.institution.tier === "pro" ? "Institution Pro" : "Institution Lite"} · ${d.institution.status}`}
      />

      {/* Overview cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Users} label="Total Students" value={String(d.total_students)} sub={`${d.institution.seats_used}/${d.institution.seat_limit} seats`} />
        <StatCard icon={Activity} label="Active This Week" value={String(d.active_this_week)} sub={`${d.total_students ? Math.round((d.active_this_week / d.total_students) * 100) : 0}% engagement`} />
        <StatCard icon={BarChart3} label="Avg DRS" value={String(d.avg_drs)} sub="Defense Readiness Score" />
        <StatCard icon={BarChart3} label="Avg Viva Score" value={d.avg_viva_score ? `${d.avg_viva_score}%` : "N/A"} sub={`${d.total_vivas} sessions`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Readiness Distribution */}
        <Card>
          <h3 className="text-base font-semibold">Readiness Distribution</h3>
          <div className="mt-4 space-y-3">
            {Object.entries(d.readiness_distribution).map(([band, count]) => (
              <div key={band} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${bandColor(band)}`} />
                  <span className="text-sm font-medium capitalize">{band}</span>
                </div>
                <span className="text-sm font-bold">{count}</span>
              </div>
            ))}
          </div>
          {/* Branch breakdown */}
          <h4 className="mt-6 text-sm font-semibold">By Branch</h4>
          <div className="mt-2 space-y-1.5">
            {Object.entries(d.branch_breakdown).map(([branch, count]) => (
              <div key={branch} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{branch}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Weak Topics */}
        <Card>
          <h3 className="text-base font-semibold">College-Wide Weak Topics</h3>
          <div className="mt-4 space-y-2">
            {(weakTopics.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No topic data yet — students need to complete vivas first.</p>
            ) : (
              (weakTopics.data ?? []).slice(0, 8).map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-warning" /> {t.topic}
                  </span>
                  <Badge tone={t.avg_score < 40 ? "destructive" : t.avg_score < 60 ? "warning" : "success"}>
                    {Math.round(t.avg_score)}%
                  </Badge>
                </div>
              ))
            )}
          </div>

          {/* Readiness by year */}
          <h4 className="mt-6 text-sm font-semibold">Readiness by Year</h4>
          <div className="mt-2 space-y-1.5">
            {(readinessReport.data?.by_year ?? []).map((y) => (
              <div key={y.year} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{y.year}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, y.avg_drs)}%` }} />
                  </div>
                  <span className="font-medium">{y.avg_drs}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Actions bar */}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={() => void handleExport()}
          className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
        <button
          onClick={() => void invite.mutateAsync().then((r) => navigator.clipboard.writeText(r.invite_code))}
          className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium"
        >
          <Share2 className="h-4 w-4" /> {invite.isPending ? "Generating…" : "Copy Invite Code"}
        </button>
      </div>

      {/* Student table */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Students ({students.data?.total ?? 0})</h3>
          <div className="flex gap-2">
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setStudentPage(1); }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
            >
              <option value="">All Branches</option>
              {["CSE", "ECE", "EEE", "Mech", "Civil", "IT"].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setStudentPage(1); }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
            >
              <option value="">All Years</option>
              {["1st", "2nd", "3rd", "4th"].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">Branch</th>
                <th className="pb-3 pr-4">Year</th>
                <th className="pb-3 pr-4">DRS</th>
                <th className="pb-3 pr-4">Band</th>
                <th className="pb-3 pr-4">Vivas</th>
                <th className="pb-3 pr-4">Avg Score</th>
                <th className="pb-3">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {(students.data?.students ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">{s.full_name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{s.branch ?? "—"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{s.year ?? "—"}</td>
                  <td className="py-3 pr-4 font-bold">{s.drs_score}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={s.drs_band === "ready" ? "success" : s.drs_band === "almost" ? "warning" : "destructive"}>
                      {s.drs_label}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{s.viva_sessions}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{s.avg_viva_score ? `${s.avg_viva_score}%` : "—"}</td>
                  <td className="py-3 text-muted-foreground">
                    {s.last_active ? new Date(s.last_active).toLocaleDateString() : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {(students.data?.total ?? 0) > 20 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              disabled={studentPage <= 1}
              onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
              className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {studentPage} of {Math.ceil((students.data?.total ?? 0) / 20)}
            </span>
            <button
              disabled={studentPage >= Math.ceil((students.data?.total ?? 0) / 20)}
              onClick={() => setStudentPage((p) => p + 1)}
              className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </div>
    </Card>
  );
}

function bandColor(band: string): string {
  switch (band) {
    case "ready": return "bg-success";
    case "almost": return "bg-warning";
    case "building": return "bg-primary";
    default: return "bg-muted-foreground";
  }
}
