import { Sparkline } from "./Sparkline";
import type { KPIData } from "../data";

interface KPICardProps {
  data: KPIData;
}

function ArrowUp() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M5 2L9 7.5H1L5 2Z" fill="currentColor" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M5 8L1 2.5H9L5 8Z" fill="currentColor" />
    </svg>
  );
}

export function KPICard({ data }: KPICardProps) {
  const isPositive = data.delta >= 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 min-w-0">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-widest truncate">
        {data.label}
      </p>

      <div className="flex items-end justify-between gap-2">
        <span className="text-3xl font-semibold text-slate-900 tabular-nums tracking-tight leading-none">
          {data.value}
        </span>
        <div className="flex-shrink-0 pb-0.5">
          <Sparkline data={data.sparkline} positive={isPositive} />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
            isPositive ? "text-teal-700" : "text-rose-600"
          }`}
        >
          {isPositive ? <ArrowUp /> : <ArrowDown />}
          {Math.abs(data.delta)}%
        </span>
        <span className="text-xs text-slate-400">{data.deltaLabel}</span>
      </div>
    </div>
  );
}
