interface ReadinessGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

/** Circular readiness gauge. Color reflects the band with theme-adaptive styling. */
export function ReadinessGauge({
  score,
  size = 132,
  strokeWidth = 10,
  label,
}: ReadinessGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={`Readiness score ${clamped} percent`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-black/10 dark:text-white/10"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={
            clamped >= 80
              ? "#10b981"
              : clamped >= 60
                ? "var(--primary)"
                : clamped >= 35
                  ? "#f59e0b"
                  : "#ef4444"
          }
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 700ms ease",
            filter: "drop-shadow(0 0 6px rgba(0, 113, 227, 0.35))",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-graphik text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {clamped}
          </div>
          {label && (
            <div className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-primary/80">
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
