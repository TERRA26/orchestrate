import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("Ledger API", () => {
  it("round-trip: POST two entries then GET summary with correct totals", async () => {
    const app = createApp();

    const r1 = await request(app)
      .post("/api/ledger")
      .send({ description: "Salary", amount: 3000, category: "income" })
      .set("Content-Type", "application/json");

    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({
      id: expect.any(String),
      description: "Salary",
      amount: 3000,
      category: "income",
      date: expect.any(String),
    });

    const r2 = await request(app)
      .post("/api/ledger")
      .send({ description: "Groceries", amount: -75.5 })
      .set("Content-Type", "application/json");

    expect(r2.status).toBe(201);
    expect(r2.body.amount).toBe(-75.5);
    expect(r2.body.category).toBe("general"); // default

    const listRes = await request(app).get("/api/ledger");
    expect(listRes.status).toBe(200);
    expect(listRes.body.entries).toHaveLength(2);
    expect(listRes.body.entries[0]).toMatchObject({
      id: r1.body.id,
      description: "Salary",
      amount: 3000,
    });
    expect(listRes.body.totalCredits).toBeCloseTo(3000);
    expect(listRes.body.totalDebits).toBeCloseTo(75.5);
    expect(listRes.body.balance).toBeCloseTo(2924.5);
  });

  it("POST /api/ledger returns 400 for empty description", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/ledger")
      .send({ description: "", amount: 100 })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("POST /api/ledger returns 400 when amount is zero", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/ledger")
      .send({ description: "Zero", amount: 0 })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("POST /api/ledger returns 400 when amount is missing", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/ledger")
      .send({ description: "No amount" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("DELETE /api/ledger/:id returns 204 on success and 404 if missing", async () => {
    const app = createApp();

    const created = await request(app)
      .post("/api/ledger")
      .send({ description: "To be deleted", amount: 50 })
      .set("Content-Type", "application/json");

    expect(created.status).toBe(201);
    const { id } = created.body as { id: string };

    const deleteRes = await request(app).delete(`/api/ledger/${id}`);
    expect(deleteRes.status).toBe(204);

    const deleteAgain = await request(app).delete(`/api/ledger/${id}`);
    expect(deleteAgain.status).toBe(404);
  });
});
