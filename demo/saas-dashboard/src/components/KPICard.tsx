import type { KPI } from "../data";

interface KPICardProps {
  kpi: KPI;
  index: number;
}

export function KPICard({ kpi, index }: KPICardProps) {
  const isPositiveDelta = kpi.delta > 0;
  const deltaGood = kpi.higherIsBetter ? isPositiveDelta : !isPositiveDelta;
  const deltaColor = deltaGood ? "text-green-pos" : "text-red-neg";
  const arrow = isPositiveDelta ? "↑" : "↓";
  const absVal = Math.abs(kpi.delta);

  return (
    <div
      className={`fade-up delay-${index} relative bg-panel border border-border rounded-sm p-6 flex flex-col gap-4 overflow-hidden`}
    >
      {/* Decorative amber line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            index === 0 ? "linear-gradient(90deg, #E8A020 0%, transparent 80%)" : "transparent",
        }}
      />

      {/* Label */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-medium tracking-widest uppercase text-ink-muted">
          {kpi.label}
        </span>
        <span className="text-xs font-mono text-ink-muted opacity-40">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* Big number */}
      <div
        className="kpi-animate font-mono text-ink-primary leading-none"
        style={{
          fontSize: "2.75rem",
          fontWeight: 300,
          letterSpacing: "-0.03em",
          animationDelay: `${index * 80}ms`,
        }}
      >
        {kpi.value}
      </div>

      {/* Delta */}
      <div className="flex items-center gap-1.5 mt-auto">
        <span className={`font-mono text-sm font-medium ${deltaColor}`}>
          {arrow} {absVal.toFixed(1)}%
        </span>
        <span className="text-xs text-ink-muted">vs last month</span>
      </div>
    </div>
  );
}
