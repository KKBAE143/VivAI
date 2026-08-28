import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../lib/api";
import loginBg from "@/public/loginbg.webp";
import logoImg from "@/public/logo.jpeg";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password — VivAI" }] }),
  component: ResetPassword,
});

/** Supabase recovery links redirect here with the token in the URL hash. */
function readRecoveryToken(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const fromHash = new URLSearchParams(hash).get("access_token");
  if (fromHash) return fromHash;
  return new URLSearchParams(window.location.search).get("access_token") ?? "";
}

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

function ResetPassword() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState(readRecoveryToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      const token = readRecoveryToken();
      if (token) setAccessToken(token);
    }
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [accessToken]);

  const handleSubmit = async () => {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/reset-password", {
        body: { access_token: accessToken, new_password: password },
      });
      setDone(true);
      setTimeout(() => navigate({ to: "/login" }), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    } finally {
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

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="relative rounded-2xl border border-white/10 bg-card/85 backdrop-blur-2xl p-6 sm:p-8 shadow-[var(--shadow-glass)]">
          {/* Logo medallion chip */}
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-b from-[#AFDDFF] via-[#8DA6CC] to-[#AFDDFF] shadow-[0_0_20px_rgba(175,221,255,0.3)]">
              <div className="w-full h-full rounded-full overflow-hidden border border-white/20 bg-black">
                <img src={logoImg} alt="VivAI" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          <div className="text-center pt-2 pb-6">
            <div className="flex items-center justify-center gap-2.5">
              <span className="text-[#AFDDFF] text-sm select-none">&#10022;</span>
              <h1 className="font-graphik text-xl sm:text-2xl font-bold tracking-[0.15em] text-white uppercase">
                NEW PASSWORD
              </h1>
              <span className="text-[#AFDDFF] text-sm select-none">&#10022;</span>
            </div>
            <p className="mt-2 text-xs text-white/60">
              Choose a strong password to secure your credentials.
            </p>
          </div>

          {done ? (
            <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/15 p-4 text-xs text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Password updated. Redirecting to sign in…
            </div>
          ) : !accessToken ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/15 p-4 text-xs text-destructive">
              This reset link is invalid or has expired. Please request a new link from the{" "}
              <Link to="/forgot-password" className="font-semibold text-[#AFDDFF] underline">
                forgot password
              </Link>{" "}
              page.
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              <div>
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#AFDDFF]" />
                  NEW PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none focus:ring-1 focus:ring-[#AFDDFF] transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#AFDDFF]" />
                  CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none focus:ring-1 focus:ring-[#AFDDFF] transition-all"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="relative mt-4 block w-full rounded-xl bg-[#AFDDFF] hover:bg-[#c8e8ff] px-4 py-3.5 text-center text-sm font-bold tracking-[0.15em] text-black uppercase shadow-[0_0_20px_rgba(175,221,255,0.3)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {loading ? "UPDATING…" : "UPDATE PASSWORD"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#AFDDFF] hover:text-[#c8e8ff] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
