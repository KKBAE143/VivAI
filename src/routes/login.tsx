import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, Eye, Mail, Lock } from "lucide-react";
import { useState, useEffect } from "react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — CollgePro Navigator" },
      {
        name: "description",
        content: "Sign in to manage your B.Tech projects and prep for vivas.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      navigate({ to: "/" });
    }
  }, [token, navigate]);

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ access_token: string; refresh_token?: string | null }>(
        "/api/auth/login",
        {
          body: { email, password },
        },
      );
      login(res.access_token, res.refresh_token ?? null);
      // Route first-time users through onboarding.
      try {
        const status = await api<{ complete: boolean }>("/api/onboarding/status");
        navigate({ to: status.complete ? "/" : "/onboarding" });
      } catch {
        navigate({ to: "/" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const callbackUrl = window.location.origin + "/";
      const res = await api<{ url: string; code_verifier?: string }>(
        "/api/auth/oauth/google?redirect_to=" + encodeURIComponent(callbackUrl),
      );
      if (res.url) {
        if (res.code_verifier) {
          window.localStorage.setItem("supabase_code_verifier", res.code_verifier);
        }
        window.location.href = res.url;
      } else {
        throw new Error("No redirect URL returned from server");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google login initialization failed");
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-[oklch(0.6_0.18_30)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground/15">
            <GraduationCap className="h-5 w-5" />
          </div>
          CollgePro Navigator
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Navigate your academics with confidence.
          </h1>
          <p className="mt-3 text-base text-primary-foreground/85">
            Manage projects, prep for vivas with AI, and collaborate with your team — all in one
            place.
          </p>
        </div>
        <div className="text-sm text-primary-foreground/80">
          Built for B.Tech students, by understanding your journey.
        </div>
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl" />
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome back!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your account to continue.
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <Field
              icon={Mail}
              label="Email"
              type="email"
              placeholder="you@college.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Field
              icon={Lock}
              label="Password"
              type="password"
              placeholder="••••••••"
              trailing={<Eye className="h-4 w-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" className="h-4 w-4 rounded border-border" /> Remember me
              </label>
              <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="block w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> Or continue with{" "}
            <div className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <GoogleG /> Continue with Google
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  type,
  placeholder,
  trailing,
  value,
  onChange,
}: {
  icon: typeof Mail;
  label: string;
  type: string;
  placeholder: string;
  trailing?: React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {trailing && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {trailing}
          </span>
        )}
      </div>
    </label>
  );
}

function GoogleG() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.7 4.7-6.2 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.3-4.4 5.6l6.2 5.2C40.9 35.9 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
