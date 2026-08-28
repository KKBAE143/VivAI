interface ReadinessGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

/** Circular readiness gauge. Color reflects the band. */
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
  const color =
    clamped >= 80
      ? "var(--color-success)"
      : clamped >= 60
        ? "var(--color-primary)"
        : clamped >= 35
          ? "var(--color-warning)"
          : "var(--color-destructive)";

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
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={clamped >= 60 ? "#AFDDFF" : color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 700ms ease",
            filter: "drop-shadow(0 0 6px rgba(175, 221, 255, 0.4))",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-graphik text-2xl sm:text-3xl font-bold tracking-tight text-white">{clamped}</div>
          {label && (
            <div className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#AFDDFF]/80">
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
