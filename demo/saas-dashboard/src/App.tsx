import { KPICard } from "./components/KPICard";
import { PlanMixChart } from "./components/PlanMixChart";
import { AccountsTable } from "./components/AccountsTable";
import { kpis } from "./data";

// Sidebar nav items
const navItems = [
  { label: "Overview", icon: "▪", active: true },
  { label: "Revenue", icon: "▪", active: false },
  { label: "Accounts", icon: "▪", active: false },
  { label: "Churn", icon: "▪", active: false },
  { label: "Forecasts", icon: "▪", active: false },
];

const navBottom = [
  { label: "Integrations", icon: "▪" },
  { label: "Settings", icon: "▪" },
];

function Sidebar() {
  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r border-border"
      style={{ width: "220px", background: "#0D0D13", minHeight: "100vh" }}
    >
      {/* Logo / Product name */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          {/* Amber diamond mark */}
          <div
            className="flex-shrink-0"
            style={{
              width: "26px",
              height: "26px",
              background: "#E8A020",
              borderRadius: "4px",
              transform: "rotate(45deg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />
          <span
            className="font-display text-ink-primary leading-none"
            style={{
              fontSize: "22px",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              marginLeft: "2px",
            }}
          >
            Vela
          </span>
        </div>
        <p className="text-xs font-mono text-ink-muted mt-1.5 tracking-wider">Analytics Suite</p>
      </div>

      {/* Date range chip */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5 bg-panel border border-border rounded-sm px-3 py-2">
          <span className="text-xs font-mono text-ink-muted">Period</span>
          <span className="text-xs font-mono text-amber ml-auto">Apr 2026</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`flex items-center gap-3 px-3 py-2 rounded-sm text-left transition-colors w-full ${
              item.active
                ? "bg-amber/10 text-amber"
                : "text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]"
            }`}
            style={{
              border: "none",
              cursor: "pointer",
              background: item.active ? "rgba(232,160,32,0.10)" : undefined,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
              style={{
                background: item.active ? "#E8A020" : "#5C5870",
                transform: "rotate(45deg)",
              }}
            />
            <span className="font-sans text-sm font-medium">{item.label}</span>
            {item.active && (
              <span className="ml-auto w-1 h-4 rounded-full" style={{ background: "#E8A020" }} />
            )}
          </button>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-4 border-t border-border pt-3">
        {navBottom.map((item) => (
          <button
            key={item.label}
            className="flex items-center gap-3 px-3 py-2 rounded-sm text-left transition-colors w-full text-ink-muted hover:text-ink-secondary hover:bg-white/[0.04]"
            style={{ border: "none", cursor: "pointer" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
              style={{ background: "#5C5870", transform: "rotate(45deg)" }}
            />
            <span className="font-sans text-sm">{item.label}</span>
          </button>
        ))}

        {/* User avatar placeholder */}
        <div className="flex items-center gap-3 px-3 py-2 mt-2 border-t border-border pt-3">
          <div
            className="w-7 h-7 rounded-sm flex-shrink-0 flex items-center justify-center font-mono text-xs font-medium"
            style={{
              background: "rgba(232,160,32,0.15)",
              color: "#E8A020",
              border: "1px solid rgba(232,160,32,0.25)",
            }}
          >
            CM
          </div>
          <div className="min-w-0">
            <p className="text-xs font-sans font-medium text-ink-secondary truncate">
              Christophe M.
            </p>
            <p className="text-xs font-mono text-ink-muted truncate">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <header
      className="flex items-center justify-between px-8 border-b border-border"
      style={{ height: "60px", background: "#0D0D13" }}
    >
      <div className="flex items-center gap-3">
        <h1
          className="font-sans font-light text-ink-primary"
          style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
        >
          Overview
        </h1>
        <span className="text-ink-muted font-mono text-xs">/</span>
        <span className="text-ink-muted font-mono text-xs">Apr 2026</span>
      </div>

      {/* Right side: status + actions */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 font-mono text-xs text-ink-muted border border-border rounded-sm px-3 py-1.5"
          style={{ background: "#111118" }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "#22C55E" }}
          />
          Data live
        </div>
        <button
          className="font-mono text-xs text-ink-muted border border-border rounded-sm px-3 py-1.5 transition-colors hover:text-ink-primary hover:border-border-light"
          style={{ background: "#111118", cursor: "pointer" }}
        >
          Export CSV
        </button>
        <button
          className="font-mono text-xs font-medium rounded-sm px-3 py-1.5 transition-colors"
          style={{
            background: "#E8A020",
            color: "#0A0A0F",
            border: "none",
            cursor: "pointer",
          }}
        >
          New Report
        </button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="grain flex" style={{ minHeight: "100vh", background: "#0A0A0F" }}>
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-8 py-8" style={{ background: "#0A0A0F" }}>
          {/* Page title row */}
          <div className="fade-up delay-0 flex items-end justify-between mb-8">
            <div>
              <p className="font-mono text-xs text-ink-muted tracking-widest uppercase mb-1.5">
                Business Performance
              </p>
              <h1
                className="font-display text-ink-primary leading-none"
                style={{ fontSize: "2.25rem", fontWeight: 300, letterSpacing: "-0.03em" }}
              >
                April 2026
              </h1>
            </div>
            <div className="flex items-center gap-4 pb-1">
              {/* Mini comparison note */}
              <p className="font-mono text-xs text-ink-muted">
                ↑ Compared to <span className="text-ink-secondary">March 2026</span>
              </p>
            </div>
          </div>

          {/* ── Section 1: KPI Cards ─────────────────────────────── */}
          <section className="mb-8">
            <div className="grid grid-cols-4 gap-4">
              {kpis.map((kpi, i) => (
                <KPICard key={kpi.id} kpi={kpi} index={i} />
              ))}
            </div>
          </section>

          {/* Thin amber rule */}
          <div
            className="fade-up delay-2 mb-8"
            style={{
              height: "1px",
              background: "linear-gradient(90deg, #E8A020 0%, transparent 60%)",
            }}
          />

          {/* ── Section 2: Plan Mix Chart ────────────────────────── */}
          <section className="mb-8">
            <PlanMixChart />
          </section>

          {/* ── Section 3: Accounts Table ────────────────────────── */}
          <section className="mb-8">
            <AccountsTable />
          </section>

          {/* Footer note */}
          <div className="fade-up delay-5 text-center pb-4">
            <p className="font-mono text-xs text-ink-muted">
              Vela Analytics · Data refreshed hourly · All amounts in USD
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
