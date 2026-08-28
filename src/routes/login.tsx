import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useState, useEffect } from "react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import loginBg from "@/public/loginbg.webp";
import logoImg from "@/public/logo.jpeg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — VivAI" },
      {
        name: "description",
        content: "Sign in to manage your B.Tech projects and prep for vivas.",
      },
    ],
  }),
  component: Login,
});

function GreekMeanderFrieze() {
  return (
    <div className="w-full flex items-center justify-center overflow-hidden opacity-70 text-[#DF6D41] pb-3 border-b border-[#DF6D41]/20">
      <svg
        className="w-full h-3 max-w-[320px]"
        viewBox="0 0 320 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M0 6h12v-4h-8v8h12v-4h-4M26 6h12v-4h-8v8h12v-4h-4M52 6h12v-4h-8v8h12v-4h-4M78 6h12v-4h-8v8h12v-4h-4M104 6h12v-4h-8v8h12v-4h-4M130 6h12v-4h-8v8h12v-4h-4M156 6h12v-4h-8v8h12v-4h-4M182 6h12v-4h-8v8h12v-4h-4M208 6h12v-4h-8v8h12v-4h-4M234 6h12v-4h-8v8h12v-4h-4M260 6h12v-4h-8v8h12v-4h-4M286 6h12v-4h-8v8h12v-4h-4M312 6h8" />
      </svg>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    setError("");
    setLoading(true);
    try {
      const res = await api<{ access_token?: string; refresh_token?: string | null }>("/api/auth/login", {
        body: { email, password },
      });
      if (!res.access_token) {
        throw new Error("No access token returned from server");
      }
      login(res.access_token, res.refresh_token ?? null);
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api<{ url?: string; code_verifier?: string }>(
        "/api/auth/oauth/google/url",
        {
          method: "POST",
          body: {
            redirect_to: `${window.location.origin}/login`,
          },
        },
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
    <div className="relative min-h-screen w-full bg-black flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden font-manrope">
      {/* Ambient background mesh */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 right-[-10%] h-[550px] w-[550px] rounded-full bg-[#AFDDFF]/10 blur-[140px]" />
        <div className="absolute top-[30%] -left-32 h-[500px] w-[500px] rounded-full bg-[#8DA6CC]/8 blur-[150px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
        {/* Left Column: Medallion & Welcome */}
        <div className="flex flex-col items-center text-center">
          {/* Circular Ice Blue Medallion */}
          <div className="relative w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-full p-1.5 bg-gradient-to-b from-[#AFDDFF] via-[#8DA6CC] to-[#AFDDFF] shadow-[0_0_50px_rgba(175,221,255,0.35),0_20px_50px_rgba(0,0,0,0.95)]">
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-white/20 bg-black">
              <img
                src={logoImg}
                alt="VivAI Logo"
                className="w-full h-full object-cover rounded-full transform scale-[1.15]"
              />
            </div>
          </div>

          {/* Header */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="text-[#AFDDFF] text-lg select-none">&#10022;</span>
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-[#AFDDFF] to-transparent" />
            <h2 className="font-graphik text-2xl sm:text-3xl font-bold tracking-[0.2em] text-white uppercase">
              WELCOME
            </h2>
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-[#AFDDFF] to-transparent" />
            <span className="text-[#AFDDFF] text-lg select-none">&#10022;</span>
          </div>

          <p className="mt-3 text-sm sm:text-base text-white/60 tracking-wide max-w-sm">
            AI-powered academic defense and viva preparation operating system.
          </p>
        </div>

        {/* Right Column: Architectural Glass Card */}
        <div className="w-full max-w-md mx-auto">
          <div className="relative rounded-2xl border border-white/10 bg-card/85 backdrop-blur-2xl p-6 sm:p-8 shadow-[var(--shadow-glass)]">
            {/* Title */}
            <div className="text-center pt-2 pb-6">
              <div className="flex items-center justify-center gap-2.5">
                <span className="text-[#AFDDFF] text-sm select-none">&#10022;</span>
                <h1 className="font-graphik text-xl sm:text-2xl font-bold tracking-[0.15em] text-white uppercase">
                  SIGN IN
                </h1>
                <span className="text-[#AFDDFF] text-sm select-none">&#10022;</span>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#AFDDFF]/60" />
                <span className="text-[#AFDDFF] text-xs font-mono select-none">[ AUTH ]</span>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#AFDDFF]/60" />
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              {/* Email Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1.5">
                  <Mail className="h-3.5 w-3.5 text-[#AFDDFF]" />
                  E-MAIL
                </label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none focus:ring-1 focus:ring-[#AFDDFF] shadow-2xs transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#AFDDFF]" />
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-11 text-sm text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none focus:ring-1 focus:ring-[#AFDDFF] shadow-2xs transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-[#AFDDFF] transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 text-white/60 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-[#AFDDFF]"
                  />
                  Remember me
                </label>
                <Link
                  to="/forgot-password"
                  className="font-medium text-[#AFDDFF] hover:underline no-underline"
                >
                  Forgot password?
                </Link>
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              {/* Ice Blue Chiseled Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative mt-5 block w-full rounded-xl bg-[#AFDDFF] hover:bg-[#c8e8ff] px-4 py-3.5 text-center text-sm font-bold tracking-[0.15em] text-black uppercase shadow-[0_0_20px_rgba(175,221,255,0.3)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xs select-none">&#10022;</span>
                  <span>{loading ? "SIGNING IN…" : "SIGN IN"}</span>
                  <span className="text-xs select-none">&#10022;</span>
                </span>
              </button>
            </form>

            {/* Divider OR */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
              <span className="text-[10px] font-bold tracking-[0.25em] text-white/40 uppercase">
                OR
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
            </div>

            {/* Google Login Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold tracking-wider text-white hover:bg-white/10 hover:border-[#AFDDFF]/40 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <GoogleG /> Continue with Google
            </button>

            {/* Footer switch */}
            <p className="mt-6 text-center text-xs text-white/60">
              Don't have an account?{" "}
              <Link
                to="/signup"
                className="font-semibold text-[#AFDDFF] underline underline-offset-4 hover:text-[#c8e8ff] transition-colors ml-1"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
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
