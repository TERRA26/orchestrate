import express from "express";
import cors from "cors";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export function createApp() {
  const app = express();
  const store = new Map<string, Todo>();
  const order: string[] = [];

  app.use(express.json());
  app.use(
    cors({
      origin: "http://localhost:5173",
    }),
  );

  // POST /api/todos
  app.post("/api/todos", (req, res) => {
    const { text } = req.body as { text?: unknown };
    if (typeof text !== "string" || text.trim() === "") {
      res.status(400).json({ error: "text must be a non-empty string" });
      return;
    }
    const todo: Todo = {
      id: crypto.randomUUID(),
      text: text.trim(),
      done: false,
    };
    store.set(todo.id, todo);
    order.push(todo.id);
    res.status(201).json(todo);
  });

  // GET /api/todos
  app.get("/api/todos", (_req, res) => {
    const todos = order.map((id) => store.get(id)!);
    res.json(todos);
  });

  // DELETE /api/todos/:id
  app.delete("/api/todos/:id", (req, res) => {
    const { id } = req.params;
    if (!store.has(id)) {
      res.status(404).json({ error: "Todo not found" });
      return;
    }
    store.delete(id);
    const idx = order.indexOf(id);
    if (idx !== -1) order.splice(idx, 1);
    res.status(204).send();
  });

  return app;
}
