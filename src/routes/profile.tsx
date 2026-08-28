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
      <div className="flex flex-col gap-3 lg:gap-3.5 h-full lg:overflow-hidden overflow-y-auto font-manrope">
        {/* Integrated Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-graphik">
                Profile & Settings
              </h1>
              <span className="text-[10px] sm:text-xs text-[#AFDDFF] bg-[#AFDDFF]/15 px-2 py-0.5 rounded font-mono">
                [ USER_CONFIG ]
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Manage your personal information, academic parameters, and defense scoring models.
            </p>
          </div>
        </div>

        {/* 2-Column Split: Nav & Content */}
        <div className="grid gap-3 lg:grid-cols-[260px_1fr] flex-1 min-h-0">
          {/* Left User & Tab Navigation Card */}
          <div className="rounded-2xl border border-white/10 bg-card/85 p-4 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex flex-col justify-between">
            <div>
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#AFDDFF] text-xl font-black text-black shadow-[0_0_20px_rgba(175,221,255,0.3)]">
                    {initials}
                  </div>
                </div>
                <div className="mt-3 text-sm font-bold text-white truncate max-w-[200px] font-graphik">
                  {String(profile?.full_name ?? "Student")}
                </div>
                <div className="text-[11px] text-white/50 truncate max-w-[200px] font-mono">
                  {String(profile?.email ?? "")}
                </div>
                <div className="mt-2">
                  <span className="rounded-full bg-[#AFDDFF]/15 border border-[#AFDDFF]/30 px-2.5 py-0.5 text-[10px] font-mono font-bold text-[#AFDDFF]">
                    {[
                      profile?.year ? `${String(profile.year)} Yr` : null,
                      profile?.branch ? String(profile.branch) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Student"}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-1.5">
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
                      className={`min-h-[40px] flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                        active
                          ? "bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.3)]"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <I className="h-4 w-4" /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={signOut}
              className="mt-4 min-h-[40px] flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/15 border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/25 active:scale-95 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>

          {/* Right Main Content Card */}
          <div className="rounded-2xl border border-white/10 bg-card/85 p-4 sm:p-6 backdrop-blur-2xl shadow-[var(--shadow-glass)] flex flex-col justify-between overflow-y-auto">
            {activeTab === "profile" && (
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                      <h3 className="text-sm font-bold text-white font-graphik tracking-wide">
                        [ PROFILE_DETAILS ]
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        Update your personal identity, academic branch and roll details.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

                  <div className="mt-3.5">
                    <span className="mb-1 block text-xs font-bold text-white/70">Bio</span>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Brief note about your academic interests or goals…"
                      className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none"
                    />
                  </div>
                  {saveError && <p className="mt-2 text-xs font-mono text-rose-400">{saveError}</p>}
                  {saved && (
                    <p className="mt-2 text-xs text-[#7CE4BA] font-bold font-mono">
                      ✓ Profile saved successfully.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2.5 pt-3 border-t border-white/10">
                  <button
                    onClick={() => void refetch()}
                    className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={updateProfile.isPending}
                    onClick={() => void handleSave()}
                    className="min-h-[40px] rounded-xl bg-[#AFDDFF] px-5 py-2 text-xs font-bold text-black shadow-[0_0_12px_rgba(175,221,255,0.25)] hover:bg-[#c8e8ff] active:scale-95 disabled:opacity-50 transition-all cursor-pointer uppercase tracking-wider"
                  >
                    {updateProfile.isPending ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "readiness" && (
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                    <Gauge className="h-4 w-4 text-[#AFDDFF]" />
                    <div>
                      <h3 className="text-sm font-bold text-white font-graphik tracking-wide">
                        [ READINESS_MODEL_PREFERENCE ]
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        Choose how your Defense Readiness Score is calculated and benchmarked.
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
                  <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <div>
                      <h3 className="text-sm font-bold text-rose-400 font-graphik tracking-wide">
                        [ PRIVACY_DATA_CONTROLS ]
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
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
          </div>
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
      <span className="mb-1 block text-xs font-bold text-white/70">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full min-h-[38px] rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-white/40 disabled:opacity-40 focus:border-[#AFDDFF] focus:outline-none"
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
        className={`rounded-2xl border p-4 text-left transition-all cursor-pointer min-h-[100px] active:scale-[0.98] ${
          selected === "v1"
            ? "border-[#AFDDFF] bg-[#AFDDFF]/10 shadow-[0_0_15px_rgba(175,221,255,0.15)]"
            : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full border-2 ${
              selected === "v1" ? "border-[#AFDDFF] bg-[#AFDDFF]" : "border-white/30"
            }`}
          />
          <span className="text-sm font-bold text-white font-graphik">Classic (v1)</span>
        </div>
        <p className="mt-2 text-xs text-white/50 leading-relaxed">
          Viva performance, Presentation skills, Topic coverage, Practice consistency, Project
          progress.
        </p>
      </button>
      <button
        onClick={() => handleSwitch("v2")}
        className={`rounded-2xl border p-4 text-left transition-all cursor-pointer min-h-[100px] active:scale-[0.98] ${
          selected === "v2"
            ? "border-[#AFDDFF] bg-[#AFDDFF]/10 shadow-[0_0_15px_rgba(175,221,255,0.15)]"
            : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full border-2 ${
              selected === "v2" ? "border-[#AFDDFF] bg-[#AFDDFF]" : "border-white/30"
            }`}
          />
          <span className="text-sm font-bold text-white font-graphik">
            Defense Readiness Score (v2)
          </span>
        </div>
        <p className="mt-2 text-xs text-white/50 leading-relaxed">
          Technical Depth, Communication, Coverage, Confidence, Structure.
        </p>
      </button>
      {switchModel.isPending && (
        <p className="text-xs text-[#AFDDFF] font-mono sm:col-span-2">Switching model…</p>
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
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-500/15 border border-rose-500/30 px-4 py-2.5 text-xs sm:text-sm font-bold text-rose-400 hover:bg-rose-500/25 active:scale-95 cursor-pointer uppercase tracking-wider"
        >
          <Trash2 className="h-4 w-4" /> Delete All My Data
        </button>
      )}
      {status === "confirming" && (
        <div className="space-y-2">
          <p className="text-xs sm:text-sm font-bold text-rose-400">
            Are you absolutely sure? All data will be permanently erased.
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={() => void handleDelete()}
              className="min-h-[40px] rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-600 active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              Yes, Delete Everything
            </button>
            <button
              onClick={() => setStatus("idle")}
              className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {status === "deleting" && (
        <p className="text-xs text-white/50 font-mono">Deleting your data…</p>
      )}
      {status === "done" && (
        <p className="text-xs font-bold text-[#7CE4BA] font-mono">
          ✓ Your data has been deleted. Your account has been anonymized.
        </p>
      )}
      {status === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-rose-400 font-mono">
            Deletion failed. Please contact grievance@vivai.app
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="min-h-[36px] rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 active:scale-95 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
