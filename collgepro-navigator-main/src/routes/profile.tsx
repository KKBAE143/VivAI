import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, LogOut, Bell, Lock, Globe, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { useProfile, useUpdateProfile } from "@/lib/hooks";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — CollgePro Navigator" },
      { name: "description", content: "Manage your profile, account, and preferences." },
    ],
  }),
  component: Profile,
});

function Profile() {
  useRequireAuth();
  const { data: profile, isLoading, error, refetch } = useProfile();
  const updateProfile = useUpdateProfile();
  const { logout } = useAuth();
  const navigate = useNavigate();

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
      <AppShell>
        <PageHeader title="Profile & Settings" subtitle="Manage your account, preferences, and notifications." />
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <CardSkeleton className="h-72" />
          <CardSkeleton className="h-96" />
        </div>
      </AppShell>
    );
  }
  if (error) {
    return (
      <AppShell>
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load your profile"}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Profile & Settings" subtitle="Manage your account, preferences, and notifications." />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="grid h-24 w-24 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
                {initials}
              </div>
              <button className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-xl bg-card text-foreground shadow-[var(--shadow-card)]">
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 text-lg font-bold">{String(profile?.full_name ?? "Student")}</div>
            <div className="text-xs text-muted-foreground">{String(profile?.email ?? "")}</div>
            <Badge tone="primary">
              {[profile?.year ? `${String(profile.year)} Year` : null, profile?.branch ? String(profile.branch) : null]
                .filter(Boolean)
                .join(" · ") || "Set up your profile"}
            </Badge>
          </div>
          <div className="mt-5 space-y-2 text-sm">
            {[
              { l: "Profile", i: Sparkles, active: true },
              { l: "Account", i: Lock },
              { l: "Notifications", i: Bell },
              { l: "Preferences", i: Globe },
            ].map((t) => {
              const I = t.i;
              return (
                <button
                  key={t.l}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    t.active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <I className="h-4 w-4" /> {t.l}
                </button>
              );
            })}
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold">Profile Information</h3>
          <p className="mt-1 text-sm text-muted-foreground">Update your personal details and academic info.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Full Name" value={fullName} onChange={setFullName} />
            <Field label="Email" value={String(profile?.email ?? "")} onChange={() => undefined} disabled />
            <Field label="College Name" value={college} onChange={setCollege} />
            <Field label="Branch" value={branch} onChange={setBranch} />
            <Field label="Year of Study" value={year} onChange={setYear} />
            <Field label="Roll Number" value={rollNumber} onChange={setRollNumber} />
          </div>
          <div className="mt-5">
            <span className="mb-1.5 block text-sm font-medium">Bio</span>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {saveError && <p className="mt-3 text-sm text-destructive">{saveError}</p>}
          {saved && <p className="mt-3 text-sm text-success">Profile saved.</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button onClick={() => void refetch()} className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium">Cancel</button>
            <button
              disabled={updateProfile.isPending}
              onClick={() => void handleSave()}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {updateProfile.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </Card>
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
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm disabled:bg-secondary disabled:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}