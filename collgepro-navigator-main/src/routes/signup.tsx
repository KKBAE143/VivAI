import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — CollgePro Navigator" },
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
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await api<{ access_token: string | null; email_confirmation_required: boolean }>(
        "/api/auth/signup",
        { body: { name, email, password, college, year, branch } },
      );
      if (res.access_token) {
        login(res.access_token);
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
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.6_0.18_30)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground/15">
            <GraduationCap className="h-5 w-5" />
          </div>
          CollgePro Navigator
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-bold leading-tight">Built for your B.Tech journey.</h1>
          <ul className="space-y-2 text-primary-foreground/90">
            <li>✓ Manage PBL, Major & Mini projects</li>
            <li>✓ AI mock vivas in English, Hindi, Hinglish</li>
            <li>✓ Real-time AI presentation feedback</li>
            <li>✓ Team collaboration that works</li>
          </ul>
        </div>
        <div className="text-sm text-primary-foreground/80">12,000+ students from 200+ colleges.</div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-5">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Create your account</h2>
            <p className="mt-1 text-sm text-muted-foreground">Join thousands of students preparing smarter.</p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <Input label="Full Name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" placeholder="you@college.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="College Name" placeholder="Your college name" value={college} onChange={(e) => setCollege(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Year" options={["1st", "2nd", "3rd", "4th"]} value={year} onChange={(e) => setYear(e.target.value)} />
              <Select label="Branch" options={["CSE", "ECE", "EEE", "Mech", "Civil", "IT", "Other"]} value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <Input label="Password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input label="Confirm Password" type="password" placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
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
            <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
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
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}