import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Menu, X } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VIVAI // CORE — Academic Intelligence OS" },
      {
        name: "description",
        content:
          "Engineers the future of academic defense with Gemini-powered live viva simulations, slide intelligence, and real-time student readiness metrics.",
      },
      { property: "og:title", content: "VIVAI // CORE" },
      {
        property: "og:description",
        content: "Intelligent Viva. Absolute Readiness. Real-time academic defense simulation OS.",
      },
    ],
  }),
  component: LandingHero,
});

const navLinks = [
  { number: "01", label: "MOCK_VIVA", href: "/ai-viva", delay: "350ms" },
  { number: "02", label: "PRESENTATION_AI", href: "/ai-presentation", delay: "450ms" },
  { number: "03", label: "READINESS_INDEX", href: "/readiness", delay: "550ms" },
  { number: "04", label: "TEAM_WORKSPACE", href: "/teams", delay: "650ms" },
];

const verticalGridPositions = ["12.6%", "37.5%", "61.9%", "86.2%"];
const horizontalGridPositions = ["32.7%", "71.4%"];

const connectorLines = [
  { x1: "38%", y1: "14%", x2: "52%", y2: "14%", delay: 1200 },
  { x1: "52%", y1: "14%", x2: "60%", y2: "27%", delay: 1400 },
  { x1: "32%", y1: "58%", x2: "20%", y2: "74%", delay: 1500 },
  { x1: "20%", y1: "74%", x2: "6%", y2: "74%", delay: 1700 },
  { x1: "78%", y1: "53%", x2: "63%", y2: "53%", delay: 1800 },
  { x1: "63%", y1: "53%", x2: "50%", y2: "63%", delay: 2000 },
];

export default function LandingHero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="relative w-full h-screen overflow-hidden bg-black select-none">
      {/* Background Video Layer */}
      <video
        className="absolute inset-0 w-full h-full object-cover anim-fade-in"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_115057_94c3699b-0fd1-4124-bcf3-3626bb8c1f77.mp4"
        autoPlay
        muted
        loop
        playsInline
      />

      {/* Content Layer */}
      <div className="relative z-10 w-full h-full">
        {/* Navigation Bar */}
        <nav className="absolute top-0 left-0 w-full flex items-center px-5 md:px-[35px] py-5 md:py-[27px] z-30">
          <div className="flex items-center gap-[40px]">
            {/* Wordmark */}
            <Link
              to="/"
              className="font-graphik text-white text-[18px] md:text-[21px] leading-[21px] whitespace-nowrap anim-fade-up no-underline cursor-pointer"
              style={{ animationDelay: "200ms" }}
            >
              VIVAI // CORE
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden lg:flex items-center gap-[40px]">
              {navLinks.map((item) => (
                <Link
                  key={item.number}
                  to={item.href}
                  className="flex items-center gap-[3px] anim-fade-up no-underline"
                  style={{ animationDelay: item.delay }}
                >
                  <span className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px]">
                    {item.number}.
                  </span>
                  <span className="font-manrope text-white text-[13px] leading-[15.6px] hover:text-[#AFDDFF] transition-colors">
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Desktop Right Group (Cohort/Status) */}
          <div
            className="hidden lg:flex items-center gap-[12px] ml-auto anim-slide-right"
            style={{ animationDelay: "600ms" }}
          >
            <Sparkles className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
            <span className="font-manrope text-white text-[13px] leading-[15.6px]">
              BTECH.CS // 2026
            </span>
            <span className="font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px]">
              [ CONNECTED ]
            </span>
            <span className="font-manrope text-white text-[13px] leading-[15.6px] ml-[20px]">
              STATUS:
            </span>
            <span className="bg-[#AFDDFF] rounded-[3px] px-[5px] py-[2px] font-manrope text-black text-[13px] leading-[15.6px] font-medium">
              DEFENSE_READY
            </span>
          </div>

          {/* Mobile Hamburger Toggle Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            className="lg:hidden ml-auto relative w-[40px] h-[40px] flex items-center justify-center anim-fade-in cursor-pointer bg-transparent border-0"
            style={{ animationDelay: "400ms" }}
          >
            <span
              className={`absolute transition-all duration-300 ease-[cubic-bezier(0.76,0,0.24,1)] ${
                menuOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
              }`}
            >
              <Menu className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
            </span>
            <span
              className={`absolute transition-all duration-300 ease-[cubic-bezier(0.76,0,0.24,1)] ${
                menuOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
              }`}
            >
              <X className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
            </span>
          </button>
        </nav>

        {/* Mobile Menu Overlay */}
        <div
          className={`fixed inset-0 z-50 lg:hidden transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
            menuOpen ? "visible" : "invisible pointer-events-none"
          }`}
        >
          <div
            onClick={() => setMenuOpen(false)}
            className={`absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
              menuOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`relative h-full flex flex-col px-5 pt-24 pb-10 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
              menuOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
            }`}
          >
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 right-5 w-[40px] h-[40px] flex items-center justify-center cursor-pointer bg-transparent border-0"
            >
              <X className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
            </button>

            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-8">
              {navLinks.map((item, i) => (
                <Link
                  key={item.number}
                  to={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 no-underline transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)]"
                  style={{
                    transitionDelay: menuOpen ? `${150 + i * 75}ms` : "0ms",
                    transform: menuOpen ? "translateX(0)" : "translateX(-24px)",
                    opacity: menuOpen ? 1 : 0,
                  }}
                >
                  <span className="font-manrope text-[#AFDDFF]/80 text-[14px] leading-[1]">
                    {item.number}.
                  </span>
                  <span className="font-manrope text-white text-[28px] leading-[1.2] tracking-tight">
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>

            {/* Mobile Bottom Status Block */}
            <div
              className="mt-auto pt-10 border-t border-white/10 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)]"
              style={{
                transitionDelay: menuOpen ? "450ms" : "0ms",
                transform: menuOpen ? "translateY(0)" : "translateY(16px)",
                opacity: menuOpen ? 1 : 0,
              }}
            >
              <div className="flex items-center gap-[10px] mb-3">
                <Sparkles className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
                <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                  BTECH.CS // 2026
                </span>
                <span className="font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px]">
                  [ CONNECTED ]
                </span>
              </div>
              <div className="flex items-center gap-[8px]">
                <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                  STATUS:
                </span>
                <span className="bg-[#AFDDFF] rounded-[3px] px-[5px] py-[2px] font-manrope text-black text-[13px] leading-[15.6px] font-medium">
                  DEFENSE_READY
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main H1 Headline */}
        <h1
          className="font-graphik text-white font-normal leading-[1em] absolute anim-fade-up text-[32px] sm:text-[48px] md:text-[68px] top-[140px] sm:top-[160px] md:top-[178px] left-5 md:left-[35px] max-w-[300px] sm:max-w-[420px] md:max-w-[554px] z-20"
          style={{ animationDelay: "400ms" }}
        >
          Intelligent Viva. Absolute Readiness.
        </h1>

        {/* Grid Lines + Plus Intersections */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vertical Grid Lines */}
          {verticalGridPositions.map((left, i) => (
            <div
              key={`v-${i}`}
              className="absolute top-0 h-full w-px bg-white/[0.04] anim-grid-v"
              style={{ left, animationDelay: `${600 + i * 100}ms` }}
            />
          ))}

          {/* Horizontal Grid Lines */}
          {horizontalGridPositions.map((top, i) => (
            <div
              key={`h-${i}`}
              className="absolute left-0 w-full h-px bg-white/[0.04] anim-grid-h"
              style={{ top, animationDelay: `${800 + i * 150}ms` }}
            />
          ))}

          {/* 8 Plus Marks at Intersections */}
          {horizontalGridPositions.map((top, hi) =>
            verticalGridPositions.map((left, vi) => (
              <div
                key={`p-${hi}-${vi}`}
                className="absolute anim-scale-in"
                style={{
                  top,
                  left,
                  animationDelay: `${1000 + (hi * 4 + vi) * 80}ms`,
                }}
              >
                <div className="absolute w-[10px] h-px bg-white/70 -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute w-px h-[10px] bg-white/70 -translate-x-1/2 -translate-y-1/2" />
              </div>
            )),
          )}
        </div>

        {/* Central Nodes (Squares + Labels + SVG Elbow Connectors) */}
        <div className="absolute inset-0 pointer-events-none hidden md:block z-10">
          {/* Connector Lines */}
          {connectorLines.map((line, idx) => (
            <svg
              key={`line-${idx}`}
              className="absolute inset-0 w-full h-full pointer-events-none anim-fade-in"
              style={{ animationDelay: `${line.delay}ms` }}
            >
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ))}

          {/* Node 1: CORE VIVA ENGINE */}
          <div
            className="absolute top-[27%] left-[60%] w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] border border-white/80 anim-scale-in"
            style={{ animationDelay: "1500ms" }}
          />
          <div
            className="absolute top-[11%] left-[26%] anim-slide-left"
            style={{ animationDelay: "1100ms" }}
          >
            <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
              [ VIVA_ENGINE ]
            </span>
            <p className="font-manrope text-white/50 text-[11px] leading-[14px] mt-[4px] max-w-[160px]">
              Adaptive Gemini voice agent evaluating technical depth and architecture.
            </p>
          </div>

          {/* Node 2: READINESS DRS */}
          <div
            className="absolute top-[58%] left-[32%] w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] border border-white/80 anim-scale-in"
            style={{ animationDelay: "1800ms" }}
          />
          <div
            className="absolute top-[76%] left-[3%] anim-slide-left"
            style={{ animationDelay: "1400ms" }}
          >
            <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
              [ READINESS_DRS ]
            </span>
            <p className="font-manrope text-white/50 text-[11px] leading-[14px] mt-[4px] max-w-[160px]">
              Dynamic readiness score synthesizing weakness heatmaps and peer percentiles.
            </p>
          </div>

          {/* Node 3: LIVE MULTIMODAL DEFENSE */}
          <div
            className="absolute top-[63%] left-[50%] w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] border border-white/80 anim-scale-in"
            style={{ animationDelay: "2100ms" }}
          />
          <div
            className="absolute top-[50%] left-[78%] anim-slide-right"
            style={{ animationDelay: "1700ms" }}
          >
            <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
              [ LIVE_MULTIMODAL ]
            </span>
            <p className="font-manrope text-white/50 text-[11px] leading-[14px] mt-[4px] max-w-[180px]">
              Real-time presentation defense with slide vision and latency-free voice sync.
            </p>
          </div>
        </div>

        {/* Bottom Row: CTA Button (Left) & Chamfered Info Card (Right) */}
        <div className="absolute bottom-5 md:bottom-[35px] left-5 md:left-[35px] right-5 md:right-[35px] flex flex-col md:flex-row items-start md:items-end justify-between gap-5 md:gap-0 z-20">
          {/* CTA Button */}
          <Link
            to="/ai-viva/new"
            className="bg-[#AFDDFF] px-[16px] md:px-[20px] py-[10px] md:py-[12px] flex items-center gap-[10px] hover:bg-[#c8e8ff] transition-colors anim-fade-up no-underline cursor-pointer"
            style={{ animationDelay: "900ms" }}
          >
            <span className="text-black text-[16px] leading-none">&#10022;</span>
            <span className="font-manrope text-black text-[12px] md:text-[13px] leading-[15.6px] uppercase tracking-wide font-medium">
              LAUNCH MOCK VIVA
            </span>
          </Link>

          {/* Right Chamfered Info Card */}
          <div
            className="relative max-w-[280px] hidden sm:block anim-slide-right"
            style={{ animationDelay: "1100ms" }}
          >
            {/* Top Badge */}
            <div className="font-manrope text-black text-[13px] leading-[15.6px] bg-[#AFDDFF] px-[6px] py-[2px] inline-block mb-[10px] font-medium">
              NOT JUST MOCKS — AN ECOSYSTEM
            </div>

            {/* Chamfered Card Body */}
            <div className="relative p-[20px]">
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 280 168"
                preserveAspectRatio="none"
              >
                <polygon
                  points="0.5,0.5 279.5,0.5 279.5,167.5 30,167.5 0.5,137.5"
                  fill="none"
                  stroke="#AFDDFF"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <p className="relative font-manrope text-white text-[13px] leading-[18px] mb-[18px]">
                Engineers the future of academic defense with Gemini-powered live viva
                simulations, slide intelligence, and real-time student readiness metrics.
              </p>
              <Link
                to="/readiness"
                className="relative font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px] cursor-pointer hover:underline block font-medium no-underline"
              >
                VIEW_READINESS_METRICS
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
