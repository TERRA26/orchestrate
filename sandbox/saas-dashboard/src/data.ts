export interface WeekData {
  week: string;
  starter: number;
  growth: number;
  scale: number;
}

export const planMixData: WeekData[] = [
  { week: "Feb 17", starter: 312, growth: 148, scale: 47 },
  { week: "Feb 24", starter: 318, growth: 152, scale: 49 },
  { week: "Mar 3", starter: 325, growth: 159, scale: 51 },
  { week: "Mar 10", starter: 331, growth: 163, scale: 53 },
  { week: "Mar 17", starter: 338, growth: 171, scale: 54 },
  { week: "Mar 24", starter: 344, growth: 178, scale: 57 },
  { week: "Mar 31", starter: 351, growth: 184, scale: 59 },
  { week: "Apr 7", starter: 359, growth: 189, scale: 61 },
  { week: "Apr 14", starter: 367, growth: 196, scale: 64 },
  { week: "Apr 21", starter: 372, growth: 204, scale: 66 },
  { week: "Apr 28", starter: 379, growth: 211, scale: 68 },
  { week: "May 5", starter: 386, growth: 219, scale: 71 },
];

export interface KPIData {
  label: string;
  value: string;
  delta: number;
  deltaLabel: string;
  sparkline: number[];
}

export const kpiData: KPIData[] = [
  {
    label: "Monthly Recurring Revenue",
    value: "$84,217",
    delta: 8.3,
    deltaLabel: "vs last period",
    sparkline: [71200, 73400, 72100, 75800, 77300, 76900, 80100, 84217],
  },
  {
    label: "Active Accounts",
    value: "1,247",
    delta: 4.1,
    deltaLabel: "vs last period",
    sparkline: [1098, 1134, 1141, 1159, 1178, 1192, 1218, 1247],
  },
  {
    label: "Net Revenue Retention",
    value: "112%",
    delta: 2.1,
    deltaLabel: "vs last period",
    sparkline: [104, 106, 107, 108, 109, 110, 111, 112],
  },
  {
    label: "New Trials",
    value: "83",
    delta: -3.7,
    deltaLabel: "vs last period",
    sparkline: [97, 91, 88, 94, 86, 89, 91, 83],
  },
];

export type Plan = "Starter" | "Growth" | "Scale";
export type Health = "Healthy" | "At Risk" | "Churning";

export interface Account {
  id: string;
  name: string;
  plan: Plan;
  mrr: number;
  seats: number;
  health: Health;
  lastActive: string;
}

export const accounts: Account[] = [
  {
    id: "1",
    name: "Acme Corp",
    plan: "Scale",
    mrr: 4800,
    seats: 48,
    health: "Healthy",
    lastActive: "2 hours ago",
  },
  {
    id: "2",
    name: "Horizon Labs",
    plan: "Growth",
    mrr: 1290,
    seats: 14,
    health: "Healthy",
    lastActive: "1 hour ago",
  },
  {
    id: "3",
    name: "Meridian Health",
    plan: "Scale",
    mrr: 4200,
    seats: 39,
    health: "At Risk",
    lastActive: "3 days ago",
  },
  {
    id: "4",
    name: "Stackflow Inc",
    plan: "Starter",
    mrr: 190,
    seats: 3,
    health: "Healthy",
    lastActive: "5 minutes ago",
  },
  {
    id: "5",
    name: "Paragon Digital",
    plan: "Growth",
    mrr: 1440,
    seats: 17,
    health: "Healthy",
    lastActive: "4 hours ago",
  },
  {
    id: "6",
    name: "Culverton Systems",
    plan: "Starter",
    mrr: 190,
    seats: 2,
    health: "Churning",
    lastActive: "18 days ago",
  },
  {
    id: "7",
    name: "Pinnacle Works",
    plan: "Growth",
    mrr: 980,
    seats: 11,
    health: "At Risk",
    lastActive: "5 days ago",
  },
  {
    id: "8",
    name: "Cerulean Data",
    plan: "Scale",
    mrr: 3600,
    seats: 31,
    health: "Healthy",
    lastActive: "30 minutes ago",
  },
  {
    id: "9",
    name: "Ironside Ventures",
    plan: "Starter",
    mrr: 190,
    seats: 4,
    health: "Healthy",
    lastActive: "1 day ago",
  },
  {
    id: "10",
    name: "Brightpath AI",
    plan: "Growth",
    mrr: 1680,
    seats: 22,
    health: "Healthy",
    lastActive: "2 hours ago",
  },
];
