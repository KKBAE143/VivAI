import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  GraduationCap,
  FolderKanban,
  Target,
  ChevronRight,
  ChevronLeft,
  Check,
  Building2,
  BookOpen,
  ShieldCheck,
  Copy,
} from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth-context";
import { useCompleteOnboarding, useCreateProject } from "@/lib/hooks";
import { isLastStep, nextStep, prevStep, stepsFor, totalSteps } from "@/lib/onboarding-flow";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get started — CollgePro Navigator" },
      {
        name: "description",
        content: "Tell us about your major, project type, and goals to personalize your dashboard.",
      },
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

const typeLabels: Record<string, string> = {
  pbl: "PBL",
  major: "Major",
  mini: "Mini",
  research: "Major",
};

const roleOptions = [
  {
    id: "student",
    title: "I'm a student",
    desc: "Practice vivas, run mock sessions, and track your readiness.",
    icon: GraduationCap,
  },
  {
    id: "faculty",
    title: "I'm a faculty member",
    desc: "Conduct team vivas, observe live sessions, and sign off on marks.",
    icon: BookOpen,
  },
  {
    id: "admin",
    title: "I'm an institution admin",
    desc: "Set up your institution, approve faculty, and see cohort reports.",
    icon: ShieldCheck,
  },
];

/** Role picker shown before the wizard — the flow depends on the answer. */
function RoleChooser({ onChoose }: { onChoose: (role: string) => void }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <GraduationCap className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">How will you be using this?</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        This decides what you'll see. You can't change it yourself later, so pick carefully.
      </p>
      <div className="mt-6 grid gap-3">
        {roleOptions.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => onChoose(r.id)}
              className="flex items-start gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-semibold">{r.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{r.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
      {/* Stated up front rather than sprung on them after signup. */}
      <p className="mt-6 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
        Faculty access needs approval from your institution's admin before it takes effect. Until
        then you'll have a student's access.
      </p>
    </>
  );
}

/** Shown after a faculty request is filed — they are still a student until approved. */
function PendingApproval({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Request sent</h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Your institution's admin has to approve faculty access before you get the faculty dashboard.
        In the meantime you can use everything a student can — including running practice vivas
        yourself, which is a good way to see what your students will experience.
      </p>
      <button
        onClick={onContinue}
        className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Go to dashboard <ChevronRight className="h-4 w-4" />
      </button>
    </>
  );
}

function Onboarding() {
  useRequireAuth();
  const navigate = useNavigate();
  const completeOnboarding = useCompleteOnboarding();
  const createProject = useCreateProject();
  const [role, setRole] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState("CSE");
  const [year, setYear] = useState("3rd Year");
  const [type, setType] = useState("pbl");
  const [goals, setGoals] = useState<string[]>([]);
  const [institutionCode, setInstitutionCode] = useState("");
  const [department, setDepartment] = useState("");
  const [subjects, setSubjects] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const steps = stepsFor(role ?? "student");
  const current = steps[step];
  const last = isLastStep(role ?? "student", step);

  const toggleGoal = (g: string) =>
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  /** Create the institution when the admin leaves the naming step. */
  const createInstitution = async () => {
    if (createdCode) return true; // already created — don't make a second one
    if (!institutionName.trim()) {
      setError("Enter your institution's name to continue.");
      return false;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api<{ id: string; invite_code: string; verified: boolean }>(
        "/api/institution",
        { body: { name: institutionName.trim() } },
      );
      setCreatedCode(res.invite_code);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your institution.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const advance = async () => {
    setError("");
    // Faculty and admin must be scoped to an institution — the backend rejects
    // a gated role without one, so catch it here where the input still is.
    if (current === "institution" && role !== "student" && !institutionCode.trim()) {
      setError("Your institution's code is required for faculty access.");
      return;
    }
    if (current === "institution_create") {
      const ok = await createInstitution();
      if (!ok) return;
    }
    setStep((s) => nextStep(role ?? "student", s));
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      // An admin's role was already granted by POST /api/institution, so this
      // call deliberately omits `role`: re-requesting it would file a pending
      // claim against the institution they just created.
      const res = await completeOnboarding.mutateAsync({
        role: role === "admin" ? undefined : role,
        institution_code: institutionCode.trim() || undefined,
        department: department.trim() || undefined,
        subjects: subjects
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        branch,
        year,
        goals,
      });

      if (res && (res as { pending_approval?: boolean }).pending_approval) {
        setPending(true);
        setSaving(false);
        return;
      }

      // Only students get a seeded first project.
      if (role === "student" || role === null) {
        const label = projectTypes.find((p) => p.id === type)?.title ?? "Project";
        try {
          await createProject.mutateAsync({
            title: `My First ${label}`,
            type: typeLabels[type] ?? "PBL",
            subject: branch,
            description: goals.length ? `Goals: ${goals.join(", ")}` : undefined,
          });
        } catch {
          // Project seeding is best-effort; onboarding still completes.
        }
      }
      navigate({ to: role === "admin" ? "/admin" : "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your setup. Please try again.");
      setSaving(false);
    }
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
          {role && !pending && (
            <div className="text-xs text-muted-foreground">
              Step {step + 1} of {totalSteps(role)}
            </div>
          )}
        </div>

        {role && !pending && (
          <div className="mb-8 flex gap-2">
            {steps.map((name, i) => (
              <div
                key={name}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`}
              />
            ))}
          </div>
        )}

        <div className="rounded-2xl bg-card p-8 shadow-[var(--shadow-card)]">
          {!role && (
            <RoleChooser
              onChoose={(chosen) => {
                setRole(chosen);
                setStep(0);
              }}
            />
          )}

          {role && pending && <PendingApproval onContinue={() => navigate({ to: "/" })} />}

          {role && !pending && (
            <>
              {current === "institution" && (
                <>
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">Are you with an institution?</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role === "student"
                      ? "Enter your college's code to link your account, or skip this — you can still use everything."
                      : "Enter your institution's code. Your admin can find it in their dashboard."}
                  </p>
                  <input
                    value={institutionCode}
                    onChange={(e) => setInstitutionCode(e.target.value)}
                    placeholder="e.g. A1B2C3D4"
                    aria-label="Institution code"
                    className="mt-6 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  {role === "student" && (
                    <button
                      onClick={() => setStep((s) => nextStep(role, s))}
                      className="mt-3 text-sm font-medium text-primary underline"
                    >
                      Skip for now
                    </button>
                  )}
                </>
              )}

              {current === "academics" && (
                <>
                  <div className="flex items-center gap-3">
                    <GraduationCap className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">What are you studying?</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We'll tune templates and mock vivas to your branch.
                  </p>
                  <div className="mt-6">
                    <div className="text-sm font-semibold">Branch</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {branches.map((b) => (
                        <button
                          key={b}
                          onClick={() => setBranch(b)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                            branch === b
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground"
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
                            year === y
                              ? "border-primary bg-primary-soft text-accent-foreground"
                              : "border-border"
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {current === "project" && (
                <>
                  <div className="flex items-center gap-3">
                    <FolderKanban className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">What kind of project are you starting?</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You can switch anytime — this just seeds your first project.
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {projectTypes.map((p) => {
                      const active = type === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setType(p.id)}
                          className={`rounded-xl border p-4 text-left transition-colors ${
                            active
                              ? "border-primary bg-primary-soft"
                              : "border-border hover:border-primary"
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

              {current === "goals" && (
                <>
                  <div className="flex items-center gap-3">
                    <Target className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">Pick a few goals for this semester</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Multi-select. We'll surface AI tools that match these.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {goalOptions.map((g) => {
                      const active = goals.includes(g);
                      return (
                        <button
                          key={g}
                          onClick={() => toggleGoal(g)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground"
                          }`}
                        >
                          {active && "✓ "}
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {current === "teaching" && (
                <>
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">What do you teach?</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Used to match you to the right vivas and subjects.
                  </p>
                  <div className="mt-6">
                    <label htmlFor="department" className="text-sm font-semibold">
                      Department
                    </label>
                    <input
                      id="department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="mt-4">
                    <label htmlFor="subjects" className="text-sm font-semibold">
                      Subjects you examine
                    </label>
                    <input
                      id="subjects"
                      value={subjects}
                      onChange={(e) => setSubjects(e.target.value)}
                      placeholder="DBMS, Operating Systems, Networks"
                      className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">Separate them with commas.</p>
                  </div>
                </>
              )}

              {current === "institution_create" && (
                <>
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">Set up your institution</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You'll be its admin: you approve faculty and see cohort reports.
                  </p>
                  <input
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="e.g. Sunrise Institute of Technology"
                    aria-label="Institution name"
                    disabled={Boolean(createdCode)}
                    className="mt-6 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm disabled:opacity-60"
                  />
                  <p className="mt-4 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                    New institutions start unverified, with a 25-seat trial cap. Cohort reports and
                    exports unlock once we verify you — contact us when you're ready.
                  </p>
                </>
              )}

              {current === "invite_faculty" && (
                <>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">Invite your faculty</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Share this code. Anyone who signs up with it and asks for faculty access shows
                    up in your dashboard for approval.
                  </p>
                  <div className="mt-6 flex items-center gap-3 rounded-xl border border-border p-4">
                    <code className="flex-1 font-mono text-lg font-semibold">
                      {createdCode || "—"}
                    </code>
                    <button
                      onClick={() => void navigator.clipboard?.writeText(createdCode)}
                      disabled={!createdCode}
                      aria-label="Copy institution code"
                      className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      <Copy className="h-4 w-4" /> Copy
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Students use the same code to link their accounts.
                  </p>
                </>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setStep((s) => prevStep(s))}
                  disabled={step === 0}
                  className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                {!last ? (
                  <button
                    onClick={() => void advance()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Continue"} <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => void finish()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Finish setup"} <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
