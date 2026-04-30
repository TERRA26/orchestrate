import { useEffect, useMemo, useState } from "react";

interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

interface LedgerSummary {
  entries: LedgerEntry[];
  balance: number;
  totalCredits: number;
  totalDebits: number;
}

const fallbackSummary: LedgerSummary = {
  entries: [
    {
      id: "acme",
      description: "Acme Industrial",
      amount: 42000,
      category: "enterprise",
      date: new Date("2026-04-01").toISOString(),
    },
    {
      id: "northstar",
      description: "Northstar Clinics",
      amount: 18500,
      category: "scale",
      date: new Date("2026-04-03").toISOString(),
    },
    {
      id: "atlas",
      description: "Atlas Supply Co.",
      amount: -3200,
      category: "risk",
      date: new Date("2026-04-12").toISOString(),
    },
    {
      id: "relay",
      description: "RelayWorks",
      amount: 9800,
      category: "growth",
      date: new Date("2026-04-16").toISOString(),
    },
  ],
  balance: 67100,
  totalCredits: 70300,
  totalDebits: 3200,
};

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function KpiCard({
  label,
  value,
  delta,
  tone = "cyan",
}: {
  label: string;
  value: string;
  delta: string;
  tone?: "cyan" | "magenta" | "green";
}) {
  const color = tone === "magenta" ? "#ff2d78" : tone === "green" ? "#8cffb8" : "#00f5ff";
  return (
    <section className="border border-arcade-border bg-[#0d0d1a]/90 p-4 shadow-[inset_0_0_18px_rgba(0,245,255,0.03)]">
      <div className="text-[10px] uppercase tracking-[0.28em] text-arcade-muted">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-normal text-arcade-text">{value}</div>
      <div className="mt-2 text-xs" style={{ color }}>
        {delta}
      </div>
    </section>
  );
}

function PlanMixBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-arcade-muted">{label}</span>
        <span className="text-arcade-text">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden bg-[#15152b]">
        <div className="h-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function App() {
  const [summary, setSummary] = useState<LedgerSummary>(fallbackSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<LedgerSummary>("/api/ledger")
      .then((data) => {
        if (!cancelled && data.entries.length > 0) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError("Live API offline. Showing seeded operating data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const mrr = summary.balance;
    const churn = Math.max(1.8, (summary.totalDebits / Math.max(summary.totalCredits, 1)) * 100);
    const expansion = Math.max(12, Math.round(summary.totalCredits / 3200));
    return {
      churn: `${churn.toFixed(1)}%`,
      expansion: `+${expansion}%`,
      mrr: formatCurrency(mrr),
      netRevenue: `${Math.max(100, 100 + expansion - churn).toFixed(1)}%`,
    };
  }, [summary]);

  const accounts = summary.entries.slice(0, 6);

  return (
    <main className="min-h-screen bg-arcade-bg px-4 py-8 font-mono text-arcade-text sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-arcade-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.34em] text-arcade-cyan">LedgerPilot</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">
              Subscription command center
            </h1>
          </div>
          <div className="text-sm text-arcade-muted">
            {loading ? "Syncing revenue ledger..." : (error ?? "Live revenue ledger connected")}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="MRR" value={metrics.mrr} delta="+8.2% vs last month" />
          <KpiCard
            label="Logo churn"
            value={metrics.churn}
            delta="-0.6 pts projected"
            tone="green"
          />
          <KpiCard label="Expansion" value={metrics.expansion} delta="41 upsell signals" />
          <KpiCard
            label="Net revenue retention"
            value={metrics.netRevenue}
            delta="enterprise cohort"
            tone="magenta"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr_0.9fr]">
          <div className="border border-arcade-border bg-[#0d0d1a]/90 p-5">
            <h2 className="text-sm uppercase tracking-[0.28em] text-arcade-cyan">Plan mix</h2>
            <div className="mt-6 space-y-5">
              <PlanMixBar label="Enterprise" value={52} color="#00f5ff" />
              <PlanMixBar label="Scale" value={29} color="#8cffb8" />
              <PlanMixBar label="Growth" value={14} color="#ffcc66" />
              <PlanMixBar label="At-risk" value={5} color="#ff2d78" />
            </div>
          </div>

          <div className="overflow-hidden border border-arcade-border bg-[#0d0d1a]/90">
            <div className="border-b border-arcade-border px-5 py-4">
              <h2 className="text-sm uppercase tracking-[0.28em] text-arcade-cyan">Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-[10px] uppercase tracking-[0.22em] text-arcade-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">MRR</th>
                    <th className="px-4 py-3 font-medium">Renewal</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((entry, index) => (
                    <tr key={entry.id} className="border-t border-arcade-border/70">
                      <td className="px-5 py-4">{entry.description}</td>
                      <td className="px-4 py-4 capitalize text-arcade-muted">{entry.category}</td>
                      <td className="px-4 py-4">{formatCurrency(Math.abs(entry.amount))}</td>
                      <td className="px-4 py-4 text-arcade-muted">{28 + index * 9} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-arcade-border bg-[#0d0d1a]/90 p-5">
            <h2 className="text-sm uppercase tracking-[0.28em] text-arcade-cyan">Billing risk</h2>
            <div className="mt-5 space-y-3">
              {[
                ["Atlas Supply Co.", "Card expires before renewal", "critical"],
                ["Northstar Clinics", "Usage spike near plan limit", "watch"],
                ["RelayWorks", "Expansion quote awaiting signature", "growth"],
              ].map(([account, detail, tone]) => (
                <div key={account} className="border border-arcade-border bg-[#111125] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">{account}</div>
                    <div
                      className="text-[10px] uppercase tracking-[0.18em]"
                      style={{ color: tone === "critical" ? "#ff2d78" : "#00f5ff" }}
                    >
                      {tone}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-arcade-muted">{detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
