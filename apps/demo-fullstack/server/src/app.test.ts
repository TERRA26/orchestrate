import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("Todos API", () => {
  it("round-trip: POST two todos then GET both back with correct shape", async () => {
    const app = createApp();

    // POST first todo
    const res1 = await request(app)
      .post("/api/todos")
      .send({ text: "Buy milk" })
      .set("Content-Type", "application/json");

    expect(res1.status).toBe(201);
    expect(res1.body).toMatchObject({
      id: expect.any(String),
      text: "Buy milk",
      done: false,
    });

    // POST second todo
    const res2 = await request(app)
      .post("/api/todos")
      .send({ text: "Write tests" })
      .set("Content-Type", "application/json");

    expect(res2.status).toBe(201);
    expect(res2.body).toMatchObject({
      id: expect.any(String),
      text: "Write tests",
      done: false,
    });

    // GET all todos — both must appear in insertion order
    const listRes = await request(app).get("/api/todos");

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(2);
    expect(listRes.body[0]).toMatchObject({
      id: res1.body.id,
      text: "Buy milk",
      done: false,
    });
    expect(listRes.body[1]).toMatchObject({
      id: res2.body.id,
      text: "Write tests",
      done: false,
    });
  });

  it("POST /api/todos returns 400 for empty text", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/todos")
      .send({ text: "" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("POST /api/todos returns 400 when text is missing", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/todos")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("DELETE /api/todos/:id returns 204 on success and 404 if missing", async () => {
    const app = createApp();

    // Create one todo first
    const created = await request(app)
      .post("/api/todos")
      .send({ text: "To be deleted" })
      .set("Content-Type", "application/json");

    expect(created.status).toBe(201);
    const { id } = created.body;

    // Delete it
    const deleteRes = await request(app).delete(`/api/todos/${id}`);
    expect(deleteRes.status).toBe(204);

    // Try deleting again — should be 404
    const deleteAgain = await request(app).delete(`/api/todos/${id}`);
    expect(deleteAgain.status).toBe(404);
  });
});
