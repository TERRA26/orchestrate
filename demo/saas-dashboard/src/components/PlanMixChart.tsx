import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { planMixData, planColors } from "../data";

const PLANS = ["Starter", "Growth", "Scale", "Enterprise"] as const;

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="bg-surface border border-border rounded-sm px-4 py-3 shadow-xl">
      <p className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-2">{label}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
            <span className="text-xs text-ink-secondary font-mono">{p.name}</span>
          </div>
          <span className="text-xs font-mono text-ink-primary font-medium">{p.value}</span>
        </div>
      ))}
      <div className="border-t border-border mt-2 pt-2 flex justify-between">
        <span className="text-xs font-mono text-ink-muted">Total</span>
        <span className="text-xs font-mono text-ink-primary font-medium">{total}</span>
      </div>
    </div>
  );
}

interface LegendPayload {
  value: string;
  color: string;
}

interface CustomLegendProps {
  payload?: LegendPayload[];
}

function CustomLegend({ payload }: CustomLegendProps) {
  return (
    <div className="flex gap-5 justify-end mt-2 pr-2">
      {payload?.map((p) => (
        <div key={p.value} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-xs font-mono text-ink-secondary">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PlanMixChart() {
  return (
    <div className="fade-up delay-3 bg-panel border border-border rounded-sm p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-sm font-mono font-medium tracking-widest uppercase text-ink-muted">
            Plan Distribution
          </h2>
          <p className="text-ink-primary font-sans text-lg font-light mt-1">
            Account mix by tier — last 6 months
          </p>
        </div>
        <div className="text-xs font-mono text-ink-muted bg-void border border-border px-3 py-1.5 rounded-sm">
          Stacked · Accounts
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={planMixData}
          barSize={36}
          barGap={2}
          margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#252530" strokeDasharray="0" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#5C5870", fontSize: 11, fontFamily: "DM Mono" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#5C5870", fontSize: 11, fontFamily: "DM Mono" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend content={<CustomLegend />} />
          {PLANS.map((plan) => (
            <Bar
              key={plan}
              dataKey={plan}
              stackId="a"
              fill={planColors[plan]}
              radius={plan === "Enterprise" ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
