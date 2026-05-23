// ─── KPI Data ────────────────────────────────────────────────────────────────

export interface KPI {
  id: string;
  label: string;
  value: string;
  raw: number;
  delta: number; // percent vs last month, e.g. 8.4 = +8.4%
  unit?: string;
  prefix?: string;
  higherIsBetter: boolean;
}

export const kpis: KPI[] = [
  {
    id: "mrr",
    label: "Monthly Recurring Revenue",
    value: "$284,190",
    raw: 284190,
    delta: 8.4,
    prefix: "$",
    higherIsBetter: true,
  },
  {
    id: "accounts",
    label: "Active Accounts",
    value: "1,847",
    raw: 1847,
    delta: 3.1,
    higherIsBetter: true,
  },
  {
    id: "churn",
    label: "Churn Rate",
    value: "2.3%",
    raw: 2.3,
    delta: -0.4,
    unit: "%",
    higherIsBetter: false,
  },
  {
    id: "new_arr",
    label: "Net New ARR",
    value: "$341,028",
    raw: 341028,
    delta: 12.7,
    prefix: "$",
    higherIsBetter: true,
  },
];

// ─── Plan Mix Chart Data ──────────────────────────────────────────────────────

export interface PlanMonth {
  month: string;
  Starter: number;
  Growth: number;
  Scale: number;
  Enterprise: number;
}

export const planMixData: PlanMonth[] = [
  { month: "Nov", Starter: 312, Growth: 218, Scale: 97, Enterprise: 44 },
  { month: "Dec", Starter: 298, Growth: 231, Scale: 104, Enterprise: 48 },
  { month: "Jan", Starter: 276, Growth: 249, Scale: 118, Enterprise: 53 },
  { month: "Feb", Starter: 258, Growth: 267, Scale: 131, Enterprise: 59 },
  { month: "Mar", Starter: 241, Growth: 288, Scale: 149, Enterprise: 64 },
  { month: "Apr", Starter: 224, Growth: 311, Scale: 168, Enterprise: 71 },
];

export const planColors: Record<string, string> = {
  Starter: "#3D3A50",
  Growth: "#5C5880",
  Scale: "#C4861A",
  Enterprise: "#E8A020",
};

// ─── Accounts Table Data ──────────────────────────────────────────────────────

export type AccountStatus = "Active" | "Trial" | "Past Due";
export type Plan = "Starter" | "Growth" | "Scale" | "Enterprise";

export interface Account {
  id: string;
  name: string;
  plan: Plan;
  mrr: number;
  seats: number;
  status: AccountStatus;
  lastActivity: string; // ISO date string
}

export const accounts: Account[] = [
  {
    id: "a1",
    name: "Axiom Biotech",
    plan: "Enterprise",
    mrr: 18400,
    seats: 142,
    status: "Active",
    lastActivity: "2026-05-06",
  },
  {
    id: "a2",
    name: "Orbital Systems",
    plan: "Scale",
    mrr: 7200,
    seats: 58,
    status: "Active",
    lastActivity: "2026-05-05",
  },
  {
    id: "a3",
    name: "Meridian Analytics",
    plan: "Growth",
    mrr: 2900,
    seats: 24,
    status: "Active",
    lastActivity: "2026-05-06",
  },
  {
    id: "a4",
    name: "Helix Ventures",
    plan: "Enterprise",
    mrr: 22100,
    seats: 211,
    status: "Active",
    lastActivity: "2026-05-04",
  },
  {
    id: "a5",
    name: "Canopy Cloud",
    plan: "Starter",
    mrr: 490,
    seats: 5,
    status: "Trial",
    lastActivity: "2026-05-03",
  },
  {
    id: "a6",
    name: "Stratum Labs",
    plan: "Growth",
    mrr: 2600,
    seats: 19,
    status: "Active",
    lastActivity: "2026-05-02",
  },
  {
    id: "a7",
    name: "Quantum Leap AI",
    plan: "Scale",
    mrr: 6800,
    seats: 47,
    status: "Past Due",
    lastActivity: "2026-04-28",
  },
  {
    id: "a8",
    name: "Prism Software",
    plan: "Starter",
    mrr: 490,
    seats: 3,
    status: "Active",
    lastActivity: "2026-05-05",
  },
  {
    id: "a9",
    name: "Vortex Security",
    plan: "Growth",
    mrr: 3100,
    seats: 27,
    status: "Active",
    lastActivity: "2026-05-01",
  },
  {
    id: "a10",
    name: "Nomad Finance",
    plan: "Starter",
    mrr: 290,
    seats: 2,
    status: "Trial",
    lastActivity: "2026-05-06",
  },
  {
    id: "a11",
    name: "Tectonic Media",
    plan: "Scale",
    mrr: 7900,
    seats: 63,
    status: "Active",
    lastActivity: "2026-04-30",
  },
  {
    id: "a12",
    name: "Lumen Health",
    plan: "Enterprise",
    mrr: 16500,
    seats: 188,
    status: "Past Due",
    lastActivity: "2026-04-22",
  },
];
