import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, FolderKanban, Target, ChevronRight, ChevronLeft, Check } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get started — CollgePro Navigator" },
      { name: "description", content: "Tell us about your major, project type, and goals to personalize your dashboard." },
    ],
  }),
  component: Onboarding,
});

const branches = ["CSE", "IT", "ECE", "EEE", "Mechanical", "Civil", "AI/ML", "Data Science"];
const years = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const projectTypes = [
  { id: "pbl", title: "PBL", desc: "Project Based Learning — semester deliverable" },
  { id: "major", title: "Major Project", desc: "Final year capstone" },
  { id: "mini", title: "Mini Project", desc: "Short-form course project" },
  { id: "research", title: "Research", desc: "Paper / publication track" },
];
const goalOptions = [
  "Ace my viva",
  "Ship a working demo",
  "Publish a paper",
  "Build a portfolio",
  "Land an internship",
  "Master DSA",
  "Learn AI/ML",
  "Improve teamwork",
];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState("CSE");
  const [year, setYear] = useState("3rd Year");
  const [type, setType] = useState("pbl");
  const [goals, setGoals] = useState<string[]>([]);

  const toggleGoal = (g: string) =>
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const finish = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cpn:onboarding", JSON.stringify({ branch, year, type, goals }));
    }
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-semibold">CollgePro Navigator</span>
          </div>
          <div className="text-xs text-muted-foreground">Step {step + 1} of 3</div>
        </div>

        <div className="mb-8 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>

        <div className="rounded-2xl bg-card p-8 shadow-[var(--shadow-card)]">
          {step === 0 && (
            <>
              <div className="flex items-center gap-3">
                <GraduationCap className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">What are you studying?</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">We'll tune templates and mock vivas to your branch.</p>
              <div className="mt-6">
                <div className="text-sm font-semibold">Branch</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {branches.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBranch(b)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        branch === b ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm font-semibold">Year</div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {years.map((y) => (
                    <button
                      key={y}
                      onClick={() => setYear(y)}
                      className={`rounded-xl border px-3 py-3 text-sm font-medium ${
                        year === y ? "border-primary bg-primary-soft text-accent-foreground" : "border-border"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-3">
                <FolderKanban className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">What kind of project are you starting?</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">You can switch anytime — this just seeds your first project.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {projectTypes.map((p) => {
                  const active = type === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setType(p.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        active ? "border-primary bg-primary-soft" : "border-border hover:border-primary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{p.title}</div>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{p.desc}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-3">
                <Target className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Pick a few goals for this semester</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Multi-select. We'll surface AI tools that match these.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {goalOptions.map((g) => {
                  const active = goals.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGoal(g)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}
                    >
                      {active && "✓ "}{g}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step < 2 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Finish setup <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}