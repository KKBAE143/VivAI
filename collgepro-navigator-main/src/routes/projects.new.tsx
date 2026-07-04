import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { useRequireAuth } from "@/lib/auth-context";
import { useCreateProject } from "@/lib/hooks";

export const Route = createFileRoute("/projects/new")({
  head: () => ({ meta: [{ title: "New Project — CollgePro Navigator" }] }),
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
        tech_stack: techStack.split(",").map((s) => s.trim()).filter(Boolean),
        problem_statement: problemStatement || null,
      });
      navigate({ to: "/projects/$id", params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project");
    }
  };

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Link to="/projects" className="grid h-9 w-9 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader title="Create Project" subtitle="Set up your new academic project in 4 quick steps." />
      </div>
      <Card>
        <div className="grid grid-cols-4 gap-3">
          {steps.map((s, i) => (
            <div key={s} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {i === 0 ? "1" : i === 1 ? "2" : i === 2 ? "3" : <Check className="h-3.5 w-3.5" />}
                </div>
                <span className={`text-xs font-medium ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
              </div>
              <div className={`h-1 rounded-full ${i === 0 ? "bg-primary" : "bg-secondary"}`} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">Project Basics</h3>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what you're building.</p>
        <div className="mt-6 space-y-5">
          <Field label="Project Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Smart Attendance System"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <Field label="Project Type">
            <div className="grid grid-cols-3 gap-3">
              {[
                { t: "PBL", d: "Project Based Learning, this semester" },
                { t: "Major", d: "Final year capstone project" },
                { t: "Mini", d: "Short scope, learn-a-tech project" },
              ].map((p) => (
                <label key={p.t} className={`cursor-pointer rounded-xl border p-4 transition-colors ${type === p.t ? "border-primary bg-primary-soft" : "border-border hover:border-primary"}`}>
                  <input
                    type="radio"
                    name="type"
                    checked={type === p.t}
                    onChange={() => setType(p.t)}
                    className="sr-only"
                  />
                  <div className="font-semibold">{p.t}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.d}</div>
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Subject / Course">
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                {SUBJECTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Expected Technologies">
              <input
                value={techStack}
                onChange={(e) => setTechStack(e.target.value)}
                placeholder="React, Node, Python"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm"
              />
            </Field>
          </div>
          <Field label="Problem Statement">
            <textarea
              rows={4}
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              placeholder="Briefly describe the problem you're solving (min 100 chars)..."
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm"
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link to="/projects" className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium">Cancel</Link>
            <button
              disabled={createMutation.isPending}
              onClick={() => void handleCreate()}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {createMutation.isPending ? "Creating…" : "Create Project"}
            </button>
          </div>
        </div>
      </Card>
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