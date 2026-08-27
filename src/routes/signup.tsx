import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — VivAI" },
      { name: "description", content: "Join thousands of B.Tech students preparing smarter." },
    ],
  }),
  component: Signup,
});

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st");
  const [branch, setBranch] = useState("CSE");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToConsent, setAgreedToConsent] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (!agreedToConsent) {
      setError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await api<{
        access_token: string | null;
        refresh_token?: string | null;
        email_confirmation_required: boolean;
      }>("/api/auth/signup", { body: { name, email, password, college, year, branch } });
      if (res.access_token) {
        login(res.access_token, res.refresh_token ?? null);
        // Record consent after successful signup
        try {
          await api("/api/privacy/consent", {
            body: { consent_type: "tos", is_minor: isMinor },
          });
          if (isMinor) {
            await api("/api/privacy/consent", {
              body: { consent_type: "parental", is_minor: true },
            });
          }
        } catch {
          // Non-blocking: consent recorded server-side on next session start
        }
        navigate({ to: "/onboarding" });
      } else {
        setInfo("Check your inbox to confirm your email, then sign in.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[oklch(0.315_0.032_208)] via-[oklch(0.27_0.028_208)] to-[oklch(0.245_0.024_208)] p-12 text-[oklch(0.958_0.008_85)] lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/20 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          VivAI
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-bold leading-tight text-[oklch(0.958_0.008_85)]">
            Built for your B.Tech journey.
          </h1>
          <ul className="space-y-2 text-[oklch(0.958_0.008_85)]/85">
            <li>✓ Manage PBL, Major & Mini projects</li>
            <li>✓ AI mock vivas in English, Hindi, Hinglish</li>
            <li>✓ Real-time AI presentation feedback</li>
            <li>✓ Team collaboration that works</li>
          </ul>
        </div>
        <div className="text-sm text-[oklch(0.958_0.008_85)]/75">
          12,000+ students from 200+ colleges.
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-5">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Create your account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Join thousands of students preparing smarter.
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <Input
              label="Full Name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@college.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="College Name"
              placeholder="Your college name"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Year"
                options={["1st", "2nd", "3rd", "4th"]}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              <Select
                label="Branch"
                options={["CSE", "ECE", "EEE", "Mech", "Civil", "IT", "Other"]}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="Confirm Password"
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {/* Consent checkboxes */}
            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreedToConsent}
                  onChange={(e) => setAgreedToConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm text-muted-foreground">
                  I agree to the{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-primary hover:underline"
                    target="_blank"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-primary hover:underline"
                    target="_blank"
                  >
                    Privacy Policy
                  </Link>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isMinor}
                  onChange={(e) => setIsMinor(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm text-muted-foreground">I am under 18 years old</span>
              </label>
              {isMinor && (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  Parental/guardian consent is required. By signing up, you confirm that a parent or
                  guardian has agreed to the Privacy Policy on your behalf.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {info && <p className="text-sm text-success">{info}</p>}
            <button
              type="submit"
              disabled={loading}
              className="block w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
