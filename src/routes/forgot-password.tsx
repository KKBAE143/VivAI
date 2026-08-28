import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import loginBg from "@/public/loginbg.webp";
import logoImg from "@/public/logo.jpeg";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — VivAI" }] }),
  component: ForgotPassword,
});

function GreekMeanderFrieze() {
  return (
    <div className="w-full flex items-center justify-center overflow-hidden opacity-60 text-[#E9631A] pb-3 border-b border-[#E9631A]/20">
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

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/forgot-password", { body: { email } });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full bg-[#0E1B1F] bg-cover bg-center bg-no-repeat flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Dark vignette overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/75"
      />

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="relative rounded-[26px] sm:rounded-[30px] border-2 border-[#E9631A]/50 bg-[#16292D]/90 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_35px_rgba(233,99,26,0.18),inset_0_1px_2px_rgba(239,239,239,0.35)]">
          {/* Logo medallion chip */}
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-b from-[#E9631A] via-[#FF8C42] to-[#E9631A] shadow-[0_0_20px_rgba(233,99,26,0.3)]">
              <div className="w-full h-full rounded-full overflow-hidden border border-[#EFEFEF]/70 bg-black/60">
                <img src={logoImg} alt="VivAI" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          <GreekMeanderFrieze />

          <div className="text-center pt-3 pb-6">
            <div className="flex items-center justify-center gap-2.5">
              <span className="text-[#E9631A] text-sm select-none">❧</span>
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-[0.2em] text-[#EFEFEF] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                RECOVERY
              </h1>
              <span className="text-[#E9631A] text-sm select-none">☙</span>
            </div>
            <p className="mt-2 text-xs text-[#D0D7D9]">
              Enter your email to receive a secure recovery key.
            </p>
          </div>

          {sent ? (
            <div className="rounded-xl border border-success/40 bg-success/15 p-4 text-center text-xs text-success space-y-2">
              <p className="font-semibold">Recovery link dispatched.</p>
              <p className="text-[11px] text-[#D0D7D9]">
                If an account exists for {email}, instructions are on their way.
              </p>
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
                <label className="text-[11px] font-bold tracking-[0.18em] text-[#EFEFEF] uppercase flex items-center gap-2 mb-1.5">
                  <Mail className="h-3.5 w-3.5 text-[#E9631A]" />
                  E-MAIL
                </label>
                <input
                  type="email"
                  placeholder="you@college.edu.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#315762] bg-[#0E1B1F]/90 px-4 py-2.5 text-sm text-[#EFEFEF] placeholder-[#7E9DA6]/50 focus:border-[#E9631A] focus:outline-none focus:ring-1 focus:ring-[#E9631A] transition-all"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="relative mt-4 block w-full rounded-xl bg-gradient-to-r from-[#D35400] via-[#E9631A] to-[#D35400] hover:from-[#E9631A] hover:via-[#FF7A29] hover:to-[#E9631A] px-4 py-3.5 text-center text-sm font-bold tracking-[0.2em] text-[#FFFFFF] uppercase shadow-[0_6px_25px_rgba(233,99,26,0.45)] border border-[#FFA568]/70 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {loading ? "SENDING…" : "SEND RESET LINK"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#E9631A] hover:text-[#FFA568] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
