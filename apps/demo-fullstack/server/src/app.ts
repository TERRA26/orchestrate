import express from "express";
import cors from "cors";

export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

export interface LedgerSummary {
  entries: LedgerEntry[];
  balance: number;
  totalCredits: number;
  totalDebits: number;
}

const seedEntries: LedgerEntry[] = [
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
];

export function createApp(options: { seed?: boolean } = {}) {
  const app = express();
  const store = new Map<string, LedgerEntry>();
  const order: string[] = [];
  if (options.seed) {
    for (const entry of seedEntries) {
      store.set(entry.id, entry);
      order.push(entry.id);
    }
  }

  app.use(express.json());
  app.use(
    cors({
      origin: ["http://localhost:5175", "http://127.0.0.1:5175"],
    }),
  );

  // GET /api/ledger
  app.get("/api/ledger", (_req, res) => {
    const entries = order.map((id) => store.get(id)!);
    const totalCredits = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
    const totalDebits = entries
      .filter((e) => e.amount < 0)
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);
    const summary: LedgerSummary = {
      entries,
      balance: totalCredits - totalDebits,
      totalCredits,
      totalDebits,
    };
    res.json(summary);
  });

  // POST /api/ledger
  app.post("/api/ledger", (req, res) => {
    const { description, amount, category } = req.body as {
      description?: unknown;
      amount?: unknown;
      category?: unknown;
    };

    if (typeof description !== "string" || description.trim() === "") {
      res.status(400).json({ error: "description must be a non-empty string" });
      return;
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
      res.status(400).json({ error: "amount must be a non-zero finite number" });
      return;
    }

    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      description: description.trim(),
      amount,
      category: typeof category === "string" && category.trim() ? category.trim() : "general",
      date: new Date().toISOString(),
    };
    store.set(entry.id, entry);
    order.push(entry.id);
    res.status(201).json(entry);
  });

  // DELETE /api/ledger/:id
  app.delete("/api/ledger/:id", (req, res) => {
    const { id } = req.params;
    if (!store.has(id)) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    store.delete(id);
    const idx = order.indexOf(id);
    if (idx !== -1) order.splice(idx, 1);
    res.status(204).send();
  });

  return app;
}
