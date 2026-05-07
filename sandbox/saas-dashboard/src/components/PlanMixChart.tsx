import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { WeekData } from "../data";

interface PlanMixChartProps {
  data: WeekData[];
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2.5 pb-2 border-b border-slate-100">{label}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-8 mb-1.5 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-slate-500">{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums text-slate-800">
            {p.value.toLocaleString()}
          </span>
        </div>
      ))}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-slate-400 font-medium">Total</span>
        <span className="font-bold tabular-nums text-slate-900">{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function PlanMixChart({ data }: PlanMixChartProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-slate-900">Plan Mix</h2>
        <p className="text-xs text-slate-400 mt-0.5">Active accounts by plan · last 12 weeks</p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gStarter" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gGrowth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0d9488" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gScale" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.75} />
              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "Epilogue, system-ui, sans-serif" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "Epilogue, system-ui, sans-serif" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{
              fontSize: 12,
              paddingTop: 16,
              fontFamily: "Epilogue, system-ui, sans-serif",
            }}
          />
          <Area
            type="monotone"
            dataKey="starter"
            name="Starter"
            stackId="1"
            stroke="#2dd4bf"
            strokeWidth={1.5}
            fill="url(#gStarter)"
          />
          <Area
            type="monotone"
            dataKey="growth"
            name="Growth"
            stackId="1"
            stroke="#0d9488"
            strokeWidth={1.5}
            fill="url(#gGrowth)"
          />
          <Area
            type="monotone"
            dataKey="scale"
            name="Scale"
            stackId="1"
            stroke="#0f766e"
            strokeWidth={1.5}
            fill="url(#gScale)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
