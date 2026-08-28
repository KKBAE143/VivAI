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
  const [parentEmail, setParentEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError("");
    setInfo("");
    if (!agreedToConsent) {
      setError("You must agree to the Terms and Privacy Policy to create an account.");
      return;
    }
    if (isMinor && !parentEmail) {
      setError("Parent or guardian email is required for users under 18.");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{
        access_token?: string;
        refresh_token?: string | null;
        message?: string;
        pending_parental_verification?: boolean;
      }>("/api/auth/signup", {
        body: {
          email,
          password,
          name,
          college,
          year,
          branch,
          agreed_to_consent: agreedToConsent,
          is_minor: isMinor,
          parent_email: isMinor ? parentEmail : undefined,
        },
      });

      if (res.pending_parental_verification) {
        setInfo(
          res.message ??
            "A verification link has been sent to your parent/guardian. Your account will be activated once they verify.",
        );
        return;
      }

      if (res.access_token) {
        login(res.access_token, res.refresh_token ?? null);
        navigate({ to: "/onboarding" });
      } else {
        setInfo(
          res.message ??
            "Registration successful! Please check your email to confirm your account.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign up");
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
              REGISTER
            </h2>
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-[#AFDDFF] to-transparent" />
            <span className="text-[#AFDDFF] text-lg select-none">&#10022;</span>
          </div>

          <p className="mt-3 text-sm sm:text-base text-white/60 tracking-wide max-w-sm">
            Join the academic intelligence operating system for B.Tech defense.
          </p>
        </div>

        {/* Right Column: Architectural Glass Card */}
        <div className="w-full max-w-md mx-auto">
          <div className="relative rounded-2xl border border-white/10 bg-card/85 backdrop-blur-2xl p-6 sm:p-8 shadow-[var(--shadow-glass)]">
            {/* Title */}
            <div className="text-center pt-2 pb-5">
              <div className="flex items-center justify-center gap-2.5">
                <span className="text-[#AFDDFF] text-sm select-none">&#10022;</span>
                <h1 className="font-graphik text-xl sm:text-2xl font-bold tracking-[0.15em] text-white uppercase">
                  CREATE ACCOUNT
                </h1>
                <span className="text-[#AFDDFF] text-sm select-none">&#10022;</span>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#AFDDFF]/60" />
                <span className="text-[#AFDDFF] text-xs font-mono select-none">[ COHORT ]</span>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#AFDDFF]/60" />
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
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1">
                  <Mail className="h-3.5 w-3.5 text-[#AFDDFF]" />
                  E-MAIL
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none focus:ring-1 focus:ring-[#AFDDFF] shadow-2xs transition-all"
                />
              </div>

              {/* Full Name Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1">
                  <User className="h-3.5 w-3.5 text-[#AFDDFF]" />
                  FULL NAME
                </label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none focus:ring-1 focus:ring-[#AFDDFF] shadow-2xs transition-all"
                />
              </div>

              {/* Password Field */}
              <div>
                <label className="text-[11px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-2 mb-1">
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
                <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">
                  Minimum 8 characters; must have two of: lower case, uppercase, numbers, symbols
                </p>
              </div>

              {/* Academic details (College, Year, Branch) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="text-[10px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-1.5 mb-1">
                    <Building className="h-3 w-3 text-[#AFDDFF]" />
                    COLLEGE
                  </label>
                  <input
                    type="text"
                    placeholder="College Name"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-1 mb-1">
                      <GraduationCap className="h-3 w-3 text-[#AFDDFF]" />
                      YEAR
                    </label>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black px-2.5 py-2 text-xs text-white focus:border-[#AFDDFF] focus:outline-none transition-all"
                    >
                      <option value="1st">1st</option>
                      <option value="2nd">2nd</option>
                      <option value="3rd">3rd</option>
                      <option value="4th">4th</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-1 mb-1">
                      <BookOpen className="h-3 w-3 text-[#AFDDFF]" />
                      BRANCH
                    </label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black px-2.5 py-2 text-xs text-white focus:border-[#AFDDFF] focus:outline-none transition-all"
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
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 space-y-2 mt-1">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={agreedToConsent}
                    onChange={(e) => setAgreedToConsent(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-[#AFDDFF]"
                  />
                  <span className="text-[11px] text-white/80 leading-tight">
                    I agree to the{" "}
                    <Link
                      to="/terms"
                      className="font-semibold text-[#AFDDFF] underline hover:text-[#c8e8ff]"
                      target="_blank"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      className="font-semibold text-[#AFDDFF] underline hover:text-[#c8e8ff]"
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
                    className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-[#AFDDFF]"
                  />
                  <span className="text-[11px] text-white/70">I am under 18 years old</span>
                </label>
                {isMinor && (
                  <div className="space-y-2">
                    <p className="rounded-lg bg-warning/15 border border-warning/20 px-2.5 py-1.5 text-[10px] text-warning">
                      Under Indian law (DPDP Act), a parent or guardian must verify their consent by
                      clicking a link sent to their email.
                    </p>
                    <div>
                      <label className="text-[10px] font-bold tracking-[0.15em] text-white/80 uppercase flex items-center gap-1.5 mb-1">
                        <Mail className="h-3 w-3 text-[#AFDDFF]" />
                        PARENT / GUARDIAN EMAIL
                      </label>
                      <input
                        type="email"
                        placeholder="parent@example.com"
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        required={isMinor}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-[#AFDDFF] focus:outline-none transition-all"
                      />
                    </div>
                  </div>
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

              {/* Ice Blue Chiseled Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative mt-4 block w-full rounded-xl bg-[#AFDDFF] hover:bg-[#c8e8ff] px-4 py-3.5 text-center text-sm font-bold tracking-[0.15em] text-black uppercase shadow-[0_0_20px_rgba(175,221,255,0.3)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xs select-none">&#10022;</span>
                  <span>{loading ? "CREATING ACCOUNT…" : "SIGN UP"}</span>
                  <span className="text-xs select-none">&#10022;</span>
                </span>
              </button>
            </form>

            {/* Divider OR */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
              <span className="text-[10px] font-bold tracking-[0.25em] text-white/40 uppercase">
                OR
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
            </div>

            {/* Footer switch */}
            <p className="mt-4 text-center text-xs text-white/60">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-[#AFDDFF] underline underline-offset-4 hover:text-[#c8e8ff] transition-colors ml-1"
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
