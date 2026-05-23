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
      date: new Date("2026-05-14").toISOString(),
    },
    {
      id: "northstar",
      description: "Northstar Clinics",
      amount: 18500,
      category: "scale",
      date: new Date("2026-05-22").toISOString(),
    },
    {
      id: "atlas",
      description: "Atlas Supply Co.",
      amount: -3200,
      category: "risk",
      date: new Date("2026-05-29").toISOString(),
    },
    {
      id: "relay",
      description: "RelayWorks",
      amount: 9800,
      category: "growth",
      date: new Date("2026-06-07").toISOString(),
    },
  ],
  balance: 67100,
  totalCredits: 70300,
  totalDebits: 3200,
};

const planMix = [
  { label: "Enterprise", value: 52, color: "bg-saas-blue" },
  { label: "Scale", value: 29, color: "bg-saas-emerald" },
  { label: "Growth", value: 14, color: "bg-saas-amber" },
  { label: "At risk", value: 5, color: "bg-saas-rose" },
];

const billingRisks = [
  {
    account: "Atlas Supply Co.",
    detail: "Card expires before renewal",
    severity: "Critical",
    tone: "text-saas-rose bg-saas-rose/10",
  },
  {
    account: "Northstar Clinics",
    detail: "Usage spike near plan limit",
    severity: "Watch",
    tone: "text-saas-amber bg-saas-amber/10",
  },
  {
    account: "RelayWorks",
    detail: "Expansion quote awaiting signature",
    severity: "Growth",
    tone: "text-saas-emerald bg-saas-emerald/10",
  },
];

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

function formatRenewalDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function KpiCard({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: string;
  delta: string;
  accent: "blue" | "emerald" | "amber" | "rose";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-saas-emerald"
      : accent === "amber"
        ? "text-saas-amber"
        : accent === "rose"
          ? "text-saas-rose"
          : "text-saas-blue";

  return (
    <section className="rounded-lg border border-saas-border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-saas-muted">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-normal text-saas-ink">{value}</div>
      <div className={`mt-2 text-sm font-medium ${accentClass}`}>{delta}</div>
    </section>
  );
}

function PlanMixBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-saas-ink">{label}</span>
        <span className="text-saas-muted">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-saas-border">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
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
        if (!cancelled && data.entries.length > 0) {
          setSummary(data);
          setError(null);
        }
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

  return (
    <main className="min-h-screen bg-saas-bg px-4 py-6 text-saas-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-saas-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold text-saas-blue">LedgerPilot</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Subscription analytics</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-saas-muted">
              Daily revenue movement, plan concentration, and renewal risk for B2B subscription
              teams.
            </p>
          </div>
          <div className="rounded-full border border-saas-border bg-white px-3 py-1.5 text-sm text-saas-muted shadow-sm">
            {loading ? "Syncing revenue ledger..." : (error ?? "Live revenue ledger connected")}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="MRR" value={metrics.mrr} delta="+8.2% vs last month" accent="blue" />
          <KpiCard
            label="Logo churn"
            value={metrics.churn}
            delta="-0.6 pts projected"
            accent="emerald"
          />
          <KpiCard
            label="Expansion"
            value={metrics.expansion}
            delta="41 upsell signals"
            accent="amber"
          />
          <KpiCard
            label="Net revenue retention"
            value={metrics.netRevenue}
            delta="Enterprise cohort"
            accent="rose"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.45fr_0.9fr]">
          <div className="rounded-lg border border-saas-border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-saas-ink">Plan mix</h2>
            <div className="mt-5 space-y-5">
              {planMix.map((plan) => (
                <PlanMixBar key={plan.label} {...plan} />
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-saas-border bg-white shadow-sm">
            <div className="border-b border-saas-border px-5 py-4">
              <h2 className="text-sm font-semibold text-saas-ink">Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-saas-bg text-xs uppercase tracking-[0.08em] text-saas-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">MRR</th>
                    <th className="px-4 py-3 font-medium">Renewal</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.entries.slice(0, 6).map((entry) => (
                    <tr key={entry.id} className="border-t border-saas-border">
                      <td className="px-5 py-4 font-medium text-saas-ink">{entry.description}</td>
                      <td className="px-4 py-4 capitalize text-saas-muted">{entry.category}</td>
                      <td className="px-4 py-4 text-saas-ink">
                        {formatCurrency(Math.abs(entry.amount))}
                      </td>
                      <td className="px-4 py-4 text-saas-muted">{formatRenewalDate(entry.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-saas-border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-saas-ink">Billing risk</h2>
            <div className="mt-5 space-y-3">
              {billingRisks.map((risk) => (
                <div key={risk.account} className="rounded-md border border-saas-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-saas-ink">{risk.account}</div>
                    <div className={`rounded-full px-2 py-0.5 text-xs font-medium ${risk.tone}`}>
                      {risk.severity}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-saas-muted">{risk.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
