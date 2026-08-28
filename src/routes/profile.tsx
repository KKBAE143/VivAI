import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  LogOut,
  Bell,
  Lock,
  Globe,
  Sparkles,
  Trash2,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { useProfile, useUpdateProfile } from "@/lib/hooks";
import { useSwitchDrsModel } from "@/lib/hooks-features";
import { api } from "@/lib/api";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — VivAI" },
      { name: "description", content: "Manage your profile, account, and preferences." },
    ],
  }),
  component: Profile,
});

type Tab = "profile" | "readiness" | "danger";

function Profile() {
  useRequireAuth();
  const { data: profile, isLoading, error, refetch } = useProfile();
  const updateProfile = useUpdateProfile();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [fullName, setFullName] = useState("");
  const [college, setCollege] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setFullName(String(profile.full_name ?? ""));
    setCollege(String(profile.college_name ?? ""));
    setBranch(String(profile.branch ?? ""));
    setYear(String(profile.year ?? ""));
    setRollNumber(String(profile.roll_number ?? ""));
    setBio(String(profile.bio ?? ""));
  }, [profile]);

  const initials =
    String(profile?.full_name ?? "Student")
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  const handleSave = async () => {
    setSaved(false);
    setSaveError("");
    try {
      await updateProfile.mutateAsync({
        full_name: fullName || null,
        college_name: college || null,
        branch: branch || null,
        year: year || null,
        roll_number: rollNumber || null,
        bio: bio || null,
      });
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save changes");
    }
  };

  const signOut = () => {
    logout();
    navigate({ to: "/login" });
  };

  if (isLoading) {
    return (
      <AppShell fitViewport hideTopBar>
        <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Profile & Settings</h1>
          </div>
          <div className="grid gap-3 lg:grid-cols-[240px_1fr] flex-1 min-h-0">
            <CardSkeleton className="h-full" />
            <CardSkeleton className="h-full" />
          </div>
        </div>
      </AppShell>
    );
  }
  if (error) {
    return (
      <AppShell fitViewport hideTopBar>
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load your profile"}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell fitViewport hideTopBar>
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Profile & Settings
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage your personal information, academic details, and preferences.
            </p>
          </div>
        </div>

        {/* 2-Column Split: Nav & Content */}
        <div className="grid gap-3 lg:grid-cols-[240px_1fr] flex-1 min-h-0">
          {/* Left User & Tab Navigation Card */}
          <Card className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
                    {initials}
                  </div>
                </div>
                <div className="mt-2.5 text-sm font-bold truncate max-w-[200px]">
                  {String(profile?.full_name ?? "Student")}
                </div>
                <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                  {String(profile?.email ?? "")}
                </div>
                <div className="mt-1.5">
                  <Badge tone="primary">
                    {[
                      profile?.year ? `${String(profile.year)} Yr` : null,
                      profile?.branch ? String(profile.branch) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Student"}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 space-y-1">
                {[
                  { id: "profile" as Tab, label: "Profile Info", icon: Sparkles },
                  { id: "readiness" as Tab, label: "Readiness Model", icon: Gauge },
                  { id: "danger" as Tab, label: "Privacy & Data", icon: AlertTriangle },
                ].map((t) => {
                  const I = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      }`}
                    >
                      <I className="h-3.5 w-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={signOut}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </Card>

          {/* Right Main Content Card */}
          <Card className="p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
            {activeTab === "profile" && (
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-border/40">
                    <div>
                      <h3 className="text-sm font-semibold">Profile Information</h3>
                      <p className="text-xs text-muted-foreground">
                        Update your personal details and academic info.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Full Name" value={fullName} onChange={setFullName} />
                    <Field
                      label="Email"
                      value={String(profile?.email ?? "")}
                      onChange={() => undefined}
                      disabled
                    />
                    <Field label="College Name" value={college} onChange={setCollege} />
                    <Field label="Branch" value={branch} onChange={setBranch} />
                    <Field label="Year of Study" value={year} onChange={setYear} />
                    <Field label="Roll Number" value={rollNumber} onChange={setRollNumber} />
                  </div>

                  <div className="mt-3">
                    <span className="mb-1 block text-xs font-medium">Bio</span>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Brief note about your academic interests or goals…"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                  {saveError && <p className="mt-2 text-xs text-destructive">{saveError}</p>}
                  {saved && (
                    <p className="mt-2 text-xs text-success font-medium">
                      Profile saved successfully.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2 pt-3 border-t border-border/40">
                  <button
                    onClick={() => void refetch()}
                    className="rounded-lg bg-secondary px-3.5 py-1.5 text-xs font-medium hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={updateProfile.isPending}
                    onClick={() => void handleSave()}
                    className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-95"
                  >
                    {updateProfile.isPending ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "readiness" && (
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                    <Gauge className="h-4 w-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">Readiness Model Preference</h3>
                      <p className="text-xs text-muted-foreground">
                        Choose how your Defense Readiness Score is calculated.
                      </p>
                    </div>
                  </div>
                  <DrsModelSelector currentModel={String(profile?.drs_model ?? "v1")} />
                </div>
              </div>
            )}

            {activeTab === "danger" && (
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <div>
                      <h3 className="text-sm font-semibold text-destructive">
                        Privacy & Data Controls
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Permanently erase all your sessions, transcripts, uploads, and scores.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <DeleteDataButton />
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-xs disabled:bg-secondary disabled:text-muted-foreground focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function DrsModelSelector({ currentModel }: { currentModel: string }) {
  const switchModel = useSwitchDrsModel();
  const [selected, setSelected] = useState(currentModel);

  useEffect(() => {
    setSelected(currentModel);
  }, [currentModel]);

  const handleSwitch = (model: "v1" | "v2") => {
    setSelected(model);
    switchModel.mutate(model);
  };

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <button
        onClick={() => handleSwitch("v1")}
        className={`rounded-xl border p-4 text-left transition-colors ${
          selected === "v1"
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full border-2 ${selected === "v1" ? "border-primary bg-primary" : "border-muted-foreground"}`}
          />
          <span className="text-sm font-semibold">Classic (v1)</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Viva performance, Presentation skills, Topic coverage, Practice consistency, Project
          progress
        </p>
      </button>
      <button
        onClick={() => handleSwitch("v2")}
        className={`rounded-xl border p-4 text-left transition-colors ${
          selected === "v2"
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full border-2 ${selected === "v2" ? "border-primary bg-primary" : "border-muted-foreground"}`}
          />
          <span className="text-sm font-semibold">Defense Readiness Score (v2)</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Technical Depth, Communication, Coverage, Confidence, Structure
        </p>
      </button>
      {switchModel.isPending && (
        <p className="text-xs text-muted-foreground sm:col-span-2">Switching model…</p>
      )}
    </div>
  );
}

function DeleteDataButton() {
  const [status, setStatus] = useState<"idle" | "confirming" | "deleting" | "done" | "error">(
    "idle",
  );

  const handleDelete = async () => {
    if (status === "idle") {
      setStatus("confirming");
      return;
    }
    if (status === "confirming") {
      setStatus("deleting");
      try {
        await api("/api/privacy/delete-my-data", { method: "POST" });
        setStatus("done");
      } catch {
        setStatus("error");
      }
    }
  };

  return (
    <div className="mt-3">
      {status === "idle" && (
        <button
          onClick={() => void handleDelete()}
          className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground"
        >
          <Trash2 className="h-4 w-4" /> Delete All My Data
        </button>
      )}
      {status === "confirming" && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            Are you absolutely sure? All data will be permanently erased.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => void handleDelete()}
              className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
            >
              Yes, Delete Everything
            </button>
            <button
              onClick={() => setStatus("idle")}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {status === "deleting" && (
        <p className="text-sm text-muted-foreground">Deleting your data…</p>
      )}
      {status === "done" && (
        <p className="text-sm font-medium text-success">
          Your data has been deleted. Your account has been anonymized.
        </p>
      )}
      {status === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Deletion failed. Please contact grievance@vivai.app
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
