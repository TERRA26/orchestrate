import { Header } from "./components/Header";
import { KPICard } from "./components/KPICard";
import { PlanMixChart } from "./components/PlanMixChart";
import { AccountsTable } from "./components/AccountsTable";
import { kpiData, planMixData, accounts } from "./data";

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          {kpiData.map((kpi) => (
            <KPICard key={kpi.label} data={kpi} />
          ))}
        </div>

        {/* Plan mix chart */}
        <PlanMixChart data={planMixData} />

        {/* Accounts table */}
        <AccountsTable accounts={accounts} />
      </main>
    </div>
  );
}

export default App;
