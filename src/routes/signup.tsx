import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Mail, Lock, User, Building, BookOpen, GraduationCap } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import loginBg from "@/public/loginbg.webp";
import logoImg from "@/public/logo.jpeg";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — VivAI" },
      { name: "description", content: "Join thousands of B.Tech students preparing smarter." },
    ],
  }),
  component: Signup,
});

function GreekMeanderFrieze() {
  return (
    <div className="w-full flex items-center justify-center overflow-hidden opacity-50 text-[#D4A346] pb-3 border-b border-[#D4A346]/20">
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

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st");
  const [branch, setBranch] = useState("CSE");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToConsent, setAgreedToConsent] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
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
          // Non-blocking
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
    <div
      className="relative min-h-screen w-full bg-[#070D0E] bg-cover bg-center bg-no-repeat flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Dark vignette overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/75"
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
        {/* Left Column: Medallion & Welcome */}
        <div className="flex flex-col items-center text-center">
          {/* Circular Gold Medallion Logo */}
          <div className="relative w-56 h-56 sm:w-72 sm:h-72 md:w-88 md:h-88 rounded-full p-2 bg-gradient-to-b from-[#E8C170] via-[#946A1B] to-[#E8C170] shadow-[0_0_50px_rgba(212,163,70,0.3),0_20px_50px_rgba(0,0,0,0.95)]">
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-[#FFE082]/70 bg-black/60">
              <img
                src={logoImg}
                alt="VivAI Logo"
                className="w-full h-full object-cover rounded-full transform scale-102"
              />
            </div>
          </div>

          {/* Classical Welcome Header */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="text-[#C69234] text-lg select-none">❧</span>
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-[#D4A346] to-transparent" />
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-[0.25em] text-[#E8C170] uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              WELCOME
            </h2>
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-[#D4A346] to-transparent" />
            <span className="text-[#C69234] text-lg select-none">☙</span>
          </div>

          <p className="mt-3 text-sm sm:text-base text-[#D0C7B7] tracking-wide max-w-sm drop-shadow-md">
            Join our community and build something legendary.
          </p>
        </div>

        {/* Right Column: Classical Architectural Tablet Card */}
        <div className="w-full max-w-md mx-auto">
          <div className="relative rounded-[26px] sm:rounded-[30px] border-2 border-[#C69234]/60 bg-[#0C1618]/90 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_35px_rgba(212,163,70,0.18),inset_0_1px_2px_rgba(255,220,130,0.35)]">
            {/* Top Greek Key Frieze Motif */}
            <GreekMeanderFrieze />

            {/* Title */}
            <div className="text-center pt-3 pb-5">
              <div className="flex items-center justify-center gap-2.5">
                <span className="text-[#C69234] text-sm select-none">❧</span>
                <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-[0.2em] text-[#E8C170] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  REGISTRATION
                </h1>
                <span className="text-[#C69234] text-sm select-none">☙</span>
              </div>
              {/* Ornate motif line */}
              <div className="mt-2 flex items-center justify-center gap-2">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#D4A346]/60" />
                <span className="text-[#D4A346] text-xs select-none">❖</span>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#D4A346]/60" />
              </div>
            </div>

            <form
              className="space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              {/* Email Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.18em] text-[#E8C170] uppercase flex items-center gap-2 mb-1">
                  <Mail className="h-3.5 w-3.5 text-[#E8C170]" />
                  E-MAIL
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#C69234]/50 bg-[#060D0F]/90 px-4 py-2.5 text-sm text-[#F4F1EA] placeholder-[#A8BDC3]/40 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] focus:shadow-[0_0_15px_rgba(245,166,35,0.3)] transition-all"
                />
              </div>

              {/* Full Name Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.18em] text-[#E8C170] uppercase flex items-center gap-2 mb-1">
                  <User className="h-3.5 w-3.5 text-[#E8C170]" />
                  FULL NAME
                </label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#C69234]/50 bg-[#060D0F]/90 px-4 py-2.5 text-sm text-[#F4F1EA] placeholder-[#A8BDC3]/40 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] focus:shadow-[0_0_15px_rgba(245,166,35,0.3)] transition-all"
                />
              </div>

              {/* Password Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.18em] text-[#E8C170] uppercase flex items-center gap-2 mb-1">
                  <Lock className="h-3.5 w-3.5 text-[#E8C170]" />
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[#C69234]/50 bg-[#060D0F]/90 px-4 py-2.5 pr-11 text-sm text-[#F4F1EA] placeholder-[#A8BDC3]/40 focus:border-[#F5A623] focus:outline-none focus:ring-1 focus:ring-[#F5A623] focus:shadow-[0_0_15px_rgba(245,166,35,0.3)] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#E8C170]/80 hover:text-[#FFE082] transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#A8BDC3]/80">
                  Minimum 8 characters; must have two of the following: lower case, uppercase,
                  numbers and symbols
                </p>
              </div>

              {/* Academic details (College, Year, Branch) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="text-[10px] font-bold tracking-[0.15em] text-[#E8C170] uppercase flex items-center gap-1.5 mb-1">
                    <Building className="h-3 w-3 text-[#E8C170]" />
                    COLLEGE
                  </label>
                  <input
                    type="text"
                    placeholder="College Name"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="w-full rounded-xl border border-[#C69234]/40 bg-[#060D0F]/90 px-3 py-2 text-xs text-[#F4F1EA] placeholder-[#A8BDC3]/40 focus:border-[#F5A623] focus:outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold tracking-[0.15em] text-[#E8C170] uppercase flex items-center gap-1 mb-1">
                      <GraduationCap className="h-3 w-3 text-[#E8C170]" />
                      YEAR
                    </label>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full rounded-xl border border-[#C69234]/40 bg-[#060D0F] px-2.5 py-2 text-xs text-[#F4F1EA] focus:border-[#F5A623] focus:outline-none transition-all"
                    >
                      <option value="1st">1st</option>
                      <option value="2nd">2nd</option>
                      <option value="3rd">3rd</option>
                      <option value="4th">4th</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-[0.15em] text-[#E8C170] uppercase flex items-center gap-1 mb-1">
                      <BookOpen className="h-3 w-3 text-[#E8C170]" />
                      BRANCH
                    </label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full rounded-xl border border-[#C69234]/40 bg-[#060D0F] px-2.5 py-2 text-xs text-[#F4F1EA] focus:border-[#F5A623] focus:outline-none transition-all"
                    >
                      <option value="CSE">CSE</option>
                      <option value="ECE">ECE</option>
                      <option value="EEE">EEE</option>
                      <option value="Mech">Mech</option>
                      <option value="Civil">Civil</option>
                      <option value="IT">IT</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Consent check */}
              <div className="rounded-xl border border-[#C69234]/30 bg-[#060D0F]/60 p-2.5 space-y-2 mt-1">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={agreedToConsent}
                    onChange={(e) => setAgreedToConsent(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-[#C69234]/50 bg-[#060D0F] accent-[#F5A623]"
                  />
                  <span className="text-[11px] text-[#D0C7B7]/90 leading-tight">
                    I agree to the{" "}
                    <Link
                      to="/privacy"
                      className="font-semibold text-[#E8C170] underline hover:text-[#FFE082]"
                      target="_blank"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      className="font-semibold text-[#E8C170] underline hover:text-[#FFE082]"
                      target="_blank"
                    >
                      Privacy Policy
                    </Link>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-[#C69234]/50 bg-[#060D0F] accent-[#F5A623]"
                  />
                  <span className="text-[11px] text-[#D0C7B7]/80">I am under 18 years old</span>
                </label>
                {isMinor && (
                  <p className="rounded-lg bg-warning/15 border border-warning/20 px-2.5 py-1.5 text-[10px] text-warning">
                    Parental/guardian consent is required.
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-xl border border-success/40 bg-success/15 px-3 py-2 text-xs text-success">
                  {info}
                </div>
              )}

              {/* Golden Chiseled Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative mt-4 block w-full rounded-xl bg-gradient-to-r from-[#C68910] via-[#F5A623] to-[#C68910] hover:from-[#D49618] hover:via-[#FFB834] hover:to-[#D49618] px-4 py-3.5 text-center text-sm font-bold tracking-[0.2em] text-[#16292D] uppercase shadow-[0_6px_25px_rgba(245,166,35,0.45)] border border-[#FFE082]/70 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xs select-none">❧</span>
                  <span>{loading ? "CREATING ACCOUNT…" : "SIGN UP"}</span>
                  <span className="text-xs select-none">☙</span>
                </span>
              </button>
            </form>

            {/* Divider OR */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#C69234]/40" />
              <span className="text-[10px] font-bold tracking-[0.25em] text-[#E8C170]/70 uppercase">
                OR
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#C69234]/40" />
            </div>

            {/* Footer switch */}
            <p className="mt-4 text-center text-xs text-[#D0C7B7]">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-[#E8C170] underline underline-offset-4 hover:text-[#FFE082] transition-colors ml-1"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
