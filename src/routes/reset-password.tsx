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
    <div
      className="relative min-h-screen w-full bg-[#1A1715] bg-cover bg-center bg-no-repeat flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Dark vignette overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/75"
      />

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="relative rounded-[26px] sm:rounded-[30px] border-2 border-[#DF6D41]/50 bg-[#1C1917]/90 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_35px_rgba(223,109,65,0.18),inset_0_1px_2px_rgba(247,216,154,0.35)]">
          {/* Logo medallion chip */}
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-b from-[#DF6D41] via-[#F7D89A] to-[#DF6D41] shadow-[0_0_20px_rgba(223,109,65,0.3)]">
              <div className="w-full h-full rounded-full overflow-hidden border border-[#F7D89A]/70 bg-black/60">
                <img src={logoImg} alt="VivAI" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          <GreekMeanderFrieze />

          <div className="text-center pt-3 pb-6">
            <div className="flex items-center justify-center gap-2.5">
              <span className="text-[#DF6D41] text-sm select-none">❧</span>
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-[0.2em] text-[#F7D89A] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                NEW PASSWORD
              </h1>
              <span className="text-[#DF6D41] text-sm select-none">☙</span>
            </div>
            <p className="mt-2 text-xs text-[#E5DCD3]">
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
              <Link to="/forgot-password" className="font-semibold text-[#DF6D41] underline">
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
                <label className="text-[11px] font-bold tracking-[0.18em] text-[#F7D89A] uppercase flex items-center gap-2 mb-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#DF6D41]" />
                  NEW PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#8DA6CC]/40 bg-[#12100E]/90 px-4 py-2.5 text-sm text-[#F7D89A] placeholder-[#8DA6CC]/50 focus:border-[#DF6D41] focus:outline-none focus:ring-1 focus:ring-[#DF6D41] transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold tracking-[0.18em] text-[#F7D89A] uppercase flex items-center gap-2 mb-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#DF6D41]" />
                  CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#8DA6CC]/40 bg-[#12100E]/90 px-4 py-2.5 text-sm text-[#F7D89A] placeholder-[#8DA6CC]/50 focus:border-[#DF6D41] focus:outline-none focus:ring-1 focus:ring-[#DF6D41] transition-all"
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
                className="relative mt-4 block w-full rounded-xl bg-gradient-to-r from-[#C2552B] via-[#DF6D41] to-[#C2552B] hover:from-[#DF6D41] hover:via-[#E88056] hover:to-[#DF6D41] px-4 py-3.5 text-center text-sm font-bold tracking-[0.2em] text-[#FFFFFF] uppercase shadow-[0_6px_25px_rgba(233,99,26,0.45)] border border-[#F7D89A]/70 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {loading ? "UPDATING…" : "UPDATE PASSWORD"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#DF6D41] hover:text-[#F7D89A] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
