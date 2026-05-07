import { useState, useMemo } from "react";
import type { Account, Health, Plan } from "../data";

type SortKey = keyof Omit<Account, "id">;
type SortDir = "asc" | "desc" | null;

const planStyles: Record<Plan, string> = {
  Starter: "bg-slate-100 text-slate-600 border border-slate-200",
  Growth: "bg-teal-50  text-teal-700  border border-teal-200",
  Scale: "bg-teal-700 text-white      border border-teal-700",
};

const healthStyles: Record<Health, { badge: string; dot: string }> = {
  Healthy: {
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  "At Risk": { badge: "bg-amber-50  text-amber-700  border border-amber-200", dot: "bg-amber-400" },
  Churning: { badge: "bg-rose-50   text-rose-700   border border-rose-200", dot: "bg-rose-500" },
};

// --- Sub-components (defined outside to avoid recreating on render) ---

interface SortIconProps {
  col: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
}

function SortIcon({ col, sortKey, sortDir }: SortIconProps) {
  if (sortKey !== col) {
    return (
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className="text-slate-300"
        aria-hidden="true"
      >
        <path
          d="M3 3.5L5 1.5L7 3.5"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M3 6.5L5 8.5L7 6.5"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (sortDir === "asc") {
    return (
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className="text-teal-600"
        aria-hidden="true"
      >
        <path
          d="M3 6.5L5 4.5L7 6.5"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className="text-teal-600"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L5 6.5L7 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ColHeaderProps {
  label: string;
  col: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
}

function ColHeader({ label, col, sortKey, sortDir, onSort }: ColHeaderProps) {
  return (
    <th
      scope="col"
      className="px-4 py-3 text-left cursor-pointer select-none group"
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-700 transition-colors">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  );
}

// --- Main component ---

interface AccountsTableProps {
  accounts: Account[];
}

export function AccountsTable({ accounts }: AccountsTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (sortDir === "desc") {
        setSortDir(null);
        setSortKey(null);
      } else {
        setSortDir("asc");
      }
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const rows = useMemo(() => {
    let result = [...accounts];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) => a.name.toLowerCase().includes(q));
    }

    if (sortKey && sortDir) {
      result.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const dir = sortDir === "asc" ? 1 : -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    return result;
  }, [accounts, search, sortKey, sortDir]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Table header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Accounts</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {rows.length} of {accounts.length} accounts
          </p>
        </div>
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M9.5 9.5L12.5 12.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-56 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100">
              <ColHeader
                label="Account"
                col="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <ColHeader
                label="Plan"
                col="plan"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <ColHeader
                label="MRR"
                col="mrr"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <ColHeader
                label="Seats"
                col="seats"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <ColHeader
                label="Health"
                col="health"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <ColHeader
                label="Last Active"
                col="lastActive"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  No accounts match &ldquo;{search}&rdquo;
                </td>
              </tr>
            ) : (
              rows.map((acc) => {
                const h = healthStyles[acc.health];
                return (
                  <tr key={acc.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {acc.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${planStyles[acc.plan]}`}
                      >
                        {acc.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-700 whitespace-nowrap">
                      ${acc.mrr.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-700">{acc.seats}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${h.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${h.dot}`} />
                        {acc.health}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {acc.lastActive}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
