import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderKanban,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth-context";
import { useCompleteOnboarding, useCreateProject } from "@/lib/hooks";
import { isLastStep, nextStep, prevStep, stepsFor, totalSteps } from "@/lib/onboarding-flow";
import { parseSubjects, validateStep, type StepName } from "@/lib/onboarding-schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get started — VivAI" },
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

const STEP_TITLES: Record<StepName, string> = {
  institution: "Are you with an institution?",
  academics: "What are you studying?",
  project: "What kind of project are you starting?",
  goals: "Pick a few goals for this semester",
  teaching: "What do you teach?",
  institution_create: "Set up your institution",
  invite_faculty: "Invite your faculty",
};

/** Selectable card used for roles and project types — keyboard and SR friendly. */
function ChoiceCard({
  selected,
  title,
  description,
  icon: Icon,
  onSelect,
}: {
  selected?: boolean;
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary hover:bg-accent/50",
      )}
    >
      {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
      <span className="flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium leading-none">{title}</span>
          {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </span>
        <span className="mt-1.5 block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/** Pill toggle for multi/single select chip rows. */
function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      )}
    >
      {children}
    </button>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeRole = role ?? "student";
  const steps = stepsFor(activeRole);
  const current = steps[step] as StepName;
  const last = isLastStep(activeRole, step);
  const values = { institutionCode, institutionName, department, subjects };

  const toggleGoal = (g: string) =>
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  /** Create the institution when the admin leaves the naming step. Idempotent. */
  const createInstitution = async () => {
    if (createdCode) return true; // already created — never make a second one
    setBusy(true);
    setError("");
    try {
      const res = await api<{ id: string; invite_code: string; verified: boolean }>(
        "/api/institution",
        { body: { name: institutionName.trim() } },
      );
      setCreatedCode(res.invite_code);
      toast.success("Institution created", {
        description: "Share the code on the next step to invite your faculty.",
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create your institution.";
      setError(message);
      toast.error("Could not create your institution", { description: message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    const problem = validateStep(current, activeRole, values);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (current === "institution_create" && !(await createInstitution())) return;
    setStep((s) => nextStep(activeRole, s));
  };

  const finish = async () => {
    const problem = validateStep(current, activeRole, values);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // An admin's role was already granted by POST /api/institution, so this
      // call deliberately omits `role`: re-requesting it would file a pending
      // claim against the institution they just created.
      const res = await completeOnboarding.mutateAsync({
        role: activeRole === "admin" ? undefined : activeRole,
        institution_code: institutionCode.trim() || undefined,
        department: department.trim() || undefined,
        subjects: parseSubjects(subjects),
        branch,
        year,
        goals,
      });

      if ((res as { pending_approval?: boolean } | undefined)?.pending_approval) {
        setPending(true);
        setBusy(false);
        return;
      }

      // Only students get a seeded first project.
      if (activeRole === "student") {
        const label = projectTypes.find((p) => p.id === type)?.title ?? "Project";
        try {
          await createProject.mutateAsync({
            title: `My First ${label}`,
            type: typeLabels[type] ?? "PBL",
            subject: branch,
            description: goals.length ? `Goals: ${goals.join(", ")}` : undefined,
          });
        } catch {
          // Seeding is best-effort — onboarding still completes. Say so rather
          // than letting the dashboard look mysteriously empty.
          toast.warning("We couldn't create your first project", {
            description: "You're all set up — add a project from your dashboard when you're ready.",
          });
        }
      }
      toast.success("You're all set");
      navigate({ to: activeRole === "admin" ? "/admin" : "/" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save your setup.";
      setError(message);
      toast.error("Could not save your setup", { description: message });
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(createdCode);
      toast.success("Code copied");
    } catch {
      // Clipboard is blocked in some browsers/contexts — the code is on screen.
      toast.error("Couldn't copy", { description: "Select the code and copy it manually." });
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpeg"
              alt="VivAI Logo"
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-border/40"
            />
            <span className="font-bold text-lg">VivAI</span>
          </div>
          {role && !pending && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Step {step + 1} of {totalSteps(activeRole)}
            </span>
          )}
        </header>

        {role && !pending && (
          <Progress
            value={((step + 1) / totalSteps(activeRole)) * 100}
            className="mb-8 h-1.5"
            aria-label="Onboarding progress"
          />
        )}

        <Card>
          {/* ---------------------------------------------------- role picker */}
          {!role && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <GraduationCap className="h-6 w-6 text-primary" />
                  How will you be using this?
                </CardTitle>
                <CardDescription>
                  This decides what you'll see. You can't change it yourself later, so pick
                  carefully.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {roleOptions.map((r) => (
                  <ChoiceCard
                    key={r.id}
                    title={r.title}
                    description={r.desc}
                    icon={r.icon}
                    onSelect={() => {
                      setRole(r.id);
                      setStep(0);
                      setError("");
                    }}
                  />
                ))}
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    Faculty access needs approval from your institution's admin before it takes
                    effect. Until then you'll have a student's access.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </>
          )}

          {/* ----------------------------------------------- pending approval */}
          {role && pending && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                  Request sent
                </CardTitle>
                <CardDescription>
                  Your institution's admin has to approve faculty access before you get the faculty
                  dashboard. Meanwhile you can use everything a student can — including running
                  practice vivas, which is a good way to see what your students will experience.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate({ to: "/" })}>
                  Go to dashboard <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </>
          )}

          {/* ------------------------------------------------------- the wizard */}
          {role && !pending && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  {current === "institution" && <Building2 className="h-6 w-6 text-primary" />}
                  {current === "academics" && <GraduationCap className="h-6 w-6 text-primary" />}
                  {current === "project" && <FolderKanban className="h-6 w-6 text-primary" />}
                  {current === "goals" && <Target className="h-6 w-6 text-primary" />}
                  {current === "teaching" && <BookOpen className="h-6 w-6 text-primary" />}
                  {current === "institution_create" && (
                    <Building2 className="h-6 w-6 text-primary" />
                  )}
                  {current === "invite_faculty" && <ShieldCheck className="h-6 w-6 text-primary" />}
                  {STEP_TITLES[current]}
                </CardTitle>
                <CardDescription>
                  {current === "institution" &&
                    (activeRole === "student"
                      ? "Enter your college's code to link your account, or skip — you can still use everything."
                      : "Enter your institution's code. Your admin can find it in their dashboard.")}
                  {current === "academics" && "We'll tune templates and mock vivas to your branch."}
                  {current === "project" &&
                    "You can switch anytime — this just seeds your first project."}
                  {current === "goals" && "Multi-select. We'll surface AI tools that match these."}
                  {current === "teaching" && "Used to match you to the right vivas and subjects."}
                  {current === "institution_create" &&
                    "You'll be its admin: you approve faculty and see cohort reports."}
                  {current === "invite_faculty" &&
                    "Share this code. Anyone who signs up with it and asks for faculty access appears in your dashboard for approval."}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {current === "institution" && (
                  <div className="space-y-2">
                    <Label htmlFor="institution-code">Institution code</Label>
                    <Input
                      id="institution-code"
                      value={institutionCode}
                      onChange={(e) => {
                        setInstitutionCode(e.target.value);
                        setError("");
                      }}
                      placeholder="e.g. A1B2C3D4"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "onboarding-error" : undefined}
                    />
                    {activeRole === "student" && (
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => {
                          setError("");
                          setStep((s) => nextStep(activeRole, s));
                        }}
                      >
                        Skip for now
                      </Button>
                    )}
                  </div>
                )}

                {current === "academics" && (
                  <>
                    <div className="space-y-3">
                      <Label>Branch</Label>
                      <div className="flex flex-wrap gap-2">
                        {branches.map((b) => (
                          <Chip key={b} active={branch === b} onClick={() => setBranch(b)}>
                            {b}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label>Year</Label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {years.map((y) => (
                          <Button
                            key={y}
                            type="button"
                            variant={year === y ? "default" : "outline"}
                            onClick={() => setYear(y)}
                            aria-pressed={year === y}
                          >
                            {y}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {current === "project" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {projectTypes.map((p) => (
                      <ChoiceCard
                        key={p.id}
                        selected={type === p.id}
                        title={p.title}
                        description={p.desc}
                        onSelect={() => setType(p.id)}
                      />
                    ))}
                  </div>
                )}

                {current === "goals" && (
                  <div className="flex flex-wrap gap-2">
                    {goalOptions.map((g) => (
                      <Chip key={g} active={goals.includes(g)} onClick={() => toggleGoal(g)}>
                        {goals.includes(g) && "✓ "}
                        {g}
                      </Chip>
                    ))}
                  </div>
                )}

                {current === "teaching" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        value={department}
                        onChange={(e) => {
                          setDepartment(e.target.value);
                          setError("");
                        }}
                        placeholder="e.g. Computer Science"
                        aria-invalid={Boolean(error)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subjects">Subjects you examine</Label>
                      <Input
                        id="subjects"
                        value={subjects}
                        onChange={(e) => {
                          setSubjects(e.target.value);
                          setError("");
                        }}
                        placeholder="DBMS, Operating Systems, Networks"
                        aria-describedby="subjects-hint"
                      />
                      <p id="subjects-hint" className="text-xs text-muted-foreground">
                        Separate them with commas. You can leave this blank.
                      </p>
                      {parseSubjects(subjects).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {parseSubjects(subjects).map((s) => (
                            <Badge key={s} variant="secondary">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {current === "institution_create" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="institution-name">Institution name</Label>
                      <Input
                        id="institution-name"
                        value={institutionName}
                        onChange={(e) => {
                          setInstitutionName(e.target.value);
                          setError("");
                        }}
                        placeholder="e.g. Sunrise Institute of Technology"
                        disabled={Boolean(createdCode)}
                        aria-invalid={Boolean(error)}
                      />
                      {createdCode && (
                        <p className="text-xs text-muted-foreground">
                          Already created — you can't rename it here.
                        </p>
                      )}
                    </div>
                    <Alert>
                      <Building2 className="h-4 w-4" />
                      <AlertDescription>
                        New institutions start unverified, with a 25-seat trial cap. Cohort reports
                        and exports unlock once we verify you — contact us when you're ready.
                      </AlertDescription>
                    </Alert>
                  </>
                )}

                {current === "invite_faculty" && (
                  <>
                    <div className="flex items-center gap-3 rounded-lg border p-4">
                      <code className="flex-1 font-mono text-lg font-semibold tracking-wider">
                        {createdCode || "—"}
                      </code>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void copyCode()}
                        disabled={!createdCode}
                      >
                        <Copy className="h-4 w-4" /> Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Students use the same code to link their accounts.
                    </p>
                  </>
                )}

                {error && (
                  <Alert variant="destructive" id="onboarding-error" aria-live="assertive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setError("");
                      setStep((s) => prevStep(s));
                    }}
                    disabled={step === 0 || busy}
                  >
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => void (last ? finish() : advance())} disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy ? "Saving…" : last ? "Finish setup" : "Continue"}
                    {!busy &&
                      (last ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
