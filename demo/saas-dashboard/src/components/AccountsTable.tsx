import { useState, useMemo } from "react";
import { accounts } from "../data";
import type { Account, AccountStatus, Plan } from "../data";

type SortKey = "mrr" | "lastActivity";
type SortDir = "asc" | "desc";

const planColors: Record<Plan, string> = {
  Starter: "#5C5880",
  Growth: "#7B78A8",
  Scale: "#C4861A",
  Enterprise: "#E8A020",
};

const statusConfig: Record<AccountStatus, { bg: string; text: string; dot: string }> = {
  Active: { bg: "rgba(34,197,94,0.10)", text: "#22C55E", dot: "#22C55E" },
  Trial: { bg: "rgba(234,179,8,0.12)", text: "#EAB308", dot: "#EAB308" },
  "Past Due": { bg: "rgba(239,68,68,0.12)", text: "#EF4444", dot: "#EF4444" },
};

function formatMRR(n: number) {
  return "$" + n.toLocaleString("en-US");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <span style={{ opacity: 0.25, fontSize: "10px", marginLeft: "4px", display: "inline-block" }}>
        ↕
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: "10px",
        marginLeft: "4px",
        display: "inline-block",
        color: "#E8A020",
      }}
    >
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function AccountsTable() {
  const [sortKey, setSortKey] = useState<SortKey>("mrr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo<Account[]>(() => {
    return [...accounts].sort((a, b) => {
      let diff = 0;
      if (sortKey === "mrr") {
        diff = a.mrr - b.mrr;
      } else if (sortKey === "lastActivity") {
        diff = new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [sortKey, sortDir]);

  return (
    <div className="fade-up delay-4 bg-panel border border-border rounded-sm">
      {/* Table header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-mono font-medium tracking-widest uppercase text-ink-muted">
            Accounts
          </h2>
          <p className="text-ink-primary font-sans text-lg font-light mt-0.5">
            {accounts.length} active subscriptions
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono text-ink-muted bg-void border border-border px-3 py-1.5 rounded-sm">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#22C55E" }}
            />
            Live
          </div>
        </div>
      </div>

      {/* Scrollable table wrapper */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {[
                { label: "Account", key: null, cls: "pl-6" },
                { label: "Plan", key: null, cls: "" },
                {
                  label: "MRR",
                  key: "mrr" as SortKey,
                  cls: "text-right",
                },
                { label: "Seats", key: null, cls: "text-right" },
                { label: "Status", key: null, cls: "text-center" },
                {
                  label: "Last Activity",
                  key: "lastActivity" as SortKey,
                  cls: "text-right pr-6",
                },
              ].map(({ label, key, cls }) => (
                <th
                  key={label}
                  className={`py-3 text-xs font-mono font-medium tracking-widest uppercase text-ink-muted ${cls}`}
                >
                  {key ? (
                    <button
                      className="sort-btn hover:text-ink-primary transition-colors"
                      onClick={() => handleSort(key)}
                      style={{
                        font: "inherit",
                        fontSize: "inherit",
                        letterSpacing: "inherit",
                        textTransform: "inherit",
                        color: "inherit",
                      }}
                    >
                      {label}
                      <SortArrow active={sortKey === key} dir={sortDir} />
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((acc, i) => {
              const status = statusConfig[acc.status];
              const isEven = i % 2 === 0;
              return (
                <tr
                  key={acc.id}
                  style={{
                    background: isEven ? "transparent" : "rgba(255,255,255,0.015)",
                  }}
                  className="border-b border-border last:border-0 hover:bg-white/[0.03] transition-colors group"
                >
                  {/* Account name */}
                  <td className="pl-6 py-3.5">
                    <span className="font-sans font-medium text-sm text-ink-primary group-hover:text-amber-glow transition-colors">
                      {acc.name}
                    </span>
                  </td>

                  {/* Plan badge */}
                  <td className="py-3.5">
                    <span
                      className="inline-flex items-center font-mono text-xs px-2 py-0.5 rounded-sm font-medium"
                      style={{
                        background: planColors[acc.plan] + "22",
                        color: planColors[acc.plan],
                        border: `1px solid ${planColors[acc.plan]}44`,
                      }}
                    >
                      {acc.plan}
                    </span>
                  </td>

                  {/* MRR */}
                  <td className="py-3.5 text-right">
                    <span className="font-mono text-sm text-ink-primary font-medium">
                      {formatMRR(acc.mrr)}
                    </span>
                  </td>

                  {/* Seats */}
                  <td className="py-3.5 text-right">
                    <span className="font-mono text-sm text-ink-secondary">{acc.seats}</span>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 text-center">
                    <span
                      className="inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-sm font-medium"
                      style={{
                        background: status.bg,
                        color: status.text,
                      }}
                    >
                      <span
                        className="inline-block w-1 h-1 rounded-full"
                        style={{ background: status.dot }}
                      />
                      {acc.status}
                    </span>
                  </td>

                  {/* Last Activity */}
                  <td className="py-3.5 text-right pr-6">
                    <span className="font-mono text-xs text-ink-secondary">
                      {formatDate(acc.lastActivity)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
