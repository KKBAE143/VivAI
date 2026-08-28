import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateProject } from "@/lib/hooks";

export const Route = createFileRoute("/projects/new")({
  head: () => ({ meta: [{ title: "New Project — VivAI" }] }),
  component: NewProject,
});

const steps = ["Project Basics", "Team Setup", "Timeline", "Review"];
const SUBJECTS = [
  "Computer Networks",
  "DBMS",
  "Machine Learning",
  "Operating Systems",
  "Software Engineering",
  "Algorithms",
  "Other",
];

function NewProject() {
  useRequireAuth();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("PBL");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [techStack, setTechStack] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [error, setError] = useState("");
  const createMutation = useCreateProject();
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Give your project a title first.");
      return;
    }
    setError("");
    try {
      const res = await createMutation.mutateAsync({
        title: title.trim(),
        type,
        subject,
        tech_stack: techStack
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        problem_statement: problemStatement || null,
      });
      navigate({ to: "/projects/$id", params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project");
    }
  };

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        <div className="flex items-center justify-between apple-glass-card rounded-[22px] px-3.5 sm:px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Link
              to="/projects"
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground no-underline"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground font-graphik">
                Create New Project
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Set up your new academic project in 4 quick steps.
              </p>
            </div>
          </div>
        </div>

        <div className="apple-glass-card p-3 sm:p-4">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {steps.map((s, i) => (
              <div key={s} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-black/5 dark:bg-white/10 text-muted-foreground"}`}
                  >
                    {i === 0 ? "1" : i === 1 ? "2" : i === 2 ? "3" : <Check className="h-3 w-3" />}
                  </div>
                  <span
                    className={`text-xs font-medium truncate ${i === 0 ? "text-foreground font-bold" : "text-muted-foreground"}`}
                  >
                    {s}
                  </span>
                </div>
                <div
                  className={`h-1 rounded-full ${i === 0 ? "bg-primary" : "bg-black/10 dark:bg-white/10"}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="apple-glass-card p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-0 overflow-y-auto">
          <div>
            <h3 className="text-base font-bold font-graphik text-foreground">Project Basics</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Tell us what you're building.</p>
            <div className="mt-4 space-y-4">
              <Field label="Project Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Smart Attendance System"
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Project Type">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { t: "PBL", d: "Project Based Learning, this semester" },
                    { t: "Major", d: "Final year capstone project" },
                    { t: "Mini", d: "Short scope, learn-a-tech project" },
                  ].map((p) => (
                    <label
                      key={p.t}
                      className={`cursor-pointer rounded-xl border p-3 transition-all ${type === p.t ? "border-primary bg-primary/10 shadow-xs" : "border-border bg-card hover:border-primary/40"}`}
                    >
                      <input
                        type="radio"
                        name="type"
                        checked={type === p.t}
                        onChange={() => setType(p.t)}
                        className="sr-only"
                      />
                      <div className="font-bold text-xs sm:text-sm text-foreground">{p.t}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground leading-tight">
                        {p.d}
                      </div>
                    </label>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Subject / Course">
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Expected Technologies">
                  <input
                    value={techStack}
                    onChange={(e) => setTechStack(e.target.value)}
                    placeholder="React, Node, Python"
                    className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </Field>
              </div>
              <Field label="Problem Statement">
                <textarea
                  rows={3}
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                  placeholder="Briefly describe the problem you're solving (min 100 chars)..."
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none resize-none"
                />
              </Field>
              {error && <p className="text-xs text-rose-500 font-mono">{error}</p>}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border mt-4">
            <Link
              to="/projects"
              className="apple-glass-btn-secondary px-4 py-2 text-xs font-semibold no-underline"
            >
              Cancel
            </Link>
            <button
              disabled={createMutation.isPending}
              onClick={() => void handleCreate()}
              className="apple-glass-btn-primary px-5 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              {createMutation.isPending ? "Creating…" : "Create Project"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
