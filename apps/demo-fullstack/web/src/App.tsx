import { useState, useEffect, useRef, type FormEvent } from "react";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CrtOverlay() {
  return (
    <>
      {/* Scanline grid */}
      <div
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
        }}
      />
      {/* Vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-40"
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)",
        }}
      />
      {/* Moving scan beam */}
      <div
        className="pointer-events-none fixed left-0 right-0 z-40 animate-scan"
        style={{
          position: "fixed",
          height: "3px",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(0,245,255,0.06) 20%, rgba(0,245,255,0.12) 50%, rgba(0,245,255,0.06) 80%, transparent 100%)",
          top: 0,
        }}
      />
    </>
  );
}

function NeonDivider({ color = "cyan" }: { color?: "cyan" | "magenta" }) {
  const c = color === "cyan" ? "#00f5ff" : "#ff2d78";
  return (
    <div className="flex gap-1 items-center w-full my-1">
      <div
        className="h-px flex-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${c})`,
          opacity: 0.35,
        }}
      />
      <div className="w-1 h-1 rotate-45 flex-shrink-0" style={{ background: c, opacity: 0.6 }} />
      <div
        className="h-px flex-1"
        style={{
          background: `linear-gradient(90deg, ${c}, transparent)`,
          opacity: 0.35,
        }}
      />
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div
      className="flex-shrink-0 w-2 h-2 rounded-full transition-all duration-300"
      style={
        active
          ? { background: "#00f5ff", boxShadow: "0 0 6px #00f5ff, 0 0 12px rgba(0,245,255,0.4)" }
          : { background: "#252540", boxShadow: "none" }
      }
    />
  );
}

function LoadingDots() {
  return (
    <div className="text-center py-20">
      <div
        className="font-arcade text-xs mb-6"
        style={{ color: "#00f5ff", textShadow: "0 0 8px #00f5ff" }}
      >
        LOADING
      </div>
      <div className="flex justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-arcade-cyan animate-blink"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="text-center py-16 border border-dashed border-arcade-dim"
      style={{ background: "rgba(13,13,26,0.4)" }}
    >
      <div className="text-arcade-subdued text-xs tracking-[0.4em] mb-3">{"[ EMPTY ]"}</div>
      <div className="text-arcade-muted text-sm tracking-wider">no quests yet. add one.</div>
    </div>
  );
}

interface TodoRowProps {
  todo: Todo;
  index: number;
  deleting: boolean;
  onDelete: (id: string) => void;
}

function TodoRow({ todo, index, deleting, onDelete }: TodoRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group flex items-center gap-3 border border-arcade-border px-4 py-3 transition-all duration-200"
      style={{
        background: todo.done ? "rgba(8,8,16,0.9)" : "rgba(15,15,32,0.9)",
        animation: `slide-in 0.25s ease-out ${index * 0.04}s both`,
        ...(hovered
          ? {
              borderColor: "rgba(0,245,255,0.25)",
              boxShadow: "0 0 12px rgba(0,245,255,0.05), inset 0 0 12px rgba(0,245,255,0.02)",
            }
          : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <StatusDot active={!todo.done} />

      <span
        className={`flex-1 text-sm tracking-wide select-none transition-colors duration-200 ${
          todo.done ? "line-through text-arcade-muted" : "text-arcade-text"
        }`}
      >
        {todo.text}
      </span>

      <button
        onClick={() => onDelete(todo.id)}
        disabled={deleting}
        className="flex-shrink-0 text-xs tracking-widest transition-all duration-200 disabled:opacity-30"
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          color: hovered ? "#ff2d78" : "#252540",
          textShadow: hovered ? "0 0 6px rgba(255,45,120,0.6)" : "none",
        }}
        aria-label={`Delete quest: ${todo.text}`}
      >
        {deleting ? "···" : "[DEL]"}
      </button>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchTodos = async () => {
    try {
      const data = await apiFetch<Todo[]>("/api/todos");
      setTodos(data);
      setError(null);
    } catch {
      setError("CONNECTION LOST. CHECK SERVER.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTodos();
  }, []);

  // ── Add ────────────────────────────────────────────────────────────────────

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const newTodo = await apiFetch<Todo>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setTodos((prev) => [...prev, newTodo]);
      setInput("");
      inputRef.current?.focus();
    } catch {
      setError("QUEST FAILED TO SAVE.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await apiFetch<undefined>(`/api/todos/${id}`, { method: "DELETE" });
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("DELETE FAILED.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeCount = todos.filter((t) => !t.done).length;
  const canSubmit = input.trim().length > 0 && !submitting;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-arcade-bg font-mono flex flex-col items-center justify-start pt-14 pb-20 px-4"
      style={{ position: "relative", overflow: "hidden" }}
    >
      <CrtOverlay />

      {/* Background grid lines */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,245,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.02) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md">
        {/* ── Header ── */}
        <header className="text-center mb-10">
          {/* System tag */}
          <div className="text-arcade-subdued text-xs tracking-[0.6em] uppercase mb-5">
            {">>> SYS.ACTIVE <<<"}
          </div>

          {/* Title */}
          <h1
            className="font-arcade animate-flicker"
            style={{
              fontSize: "clamp(1rem, 5vw, 1.5rem)",
              color: "#00f5ff",
              textShadow:
                "0 0 10px #00f5ff, 0 0 20px rgba(0,245,255,0.6), 0 0 40px rgba(0,245,255,0.3)",
              letterSpacing: "0.12em",
              lineHeight: 1.4,
            }}
          >
            QUEST LOG
          </h1>

          {/* Decorative lines */}
          <div className="mt-5">
            <NeonDivider color="cyan" />
            <NeonDivider color="magenta" />
          </div>
        </header>

        {/* ── Error banner ── */}
        {error && (
          <div
            className="mb-5 flex items-center gap-3 border border-arcade-magenta px-4 py-3 text-xs tracking-wider animate-glitch-in"
            style={{
              background: "rgba(255,45,120,0.06)",
              boxShadow: "0 0 12px rgba(255,45,120,0.15)",
            }}
          >
            <span style={{ color: "#ff2d78", textShadow: "0 0 6px #ff2d78" }}>!!</span>
            <span className="flex-1 text-arcade-magenta">{error}</span>
            <button
              className="text-arcade-subdued hover:text-arcade-magenta transition-colors duration-200 ml-2"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              [X]
            </button>
          </div>
        )}

        {/* ── Input form ── */}
        <form onSubmit={handleAdd} className="mb-7">
          <div className="flex gap-2">
            {/* Text field */}
            <div className="relative flex-1">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none pointer-events-none transition-all duration-200"
                style={{
                  color: inputFocused ? "#00f5ff" : "#4a4a7a",
                  textShadow: inputFocused ? "0 0 8px #00f5ff" : "none",
                }}
              >
                {">"}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="enter quest..."
                maxLength={200}
                disabled={submitting}
                autoFocus
                className="w-full text-arcade-text text-sm tracking-wider pl-8 pr-4 py-3 outline-none transition-all duration-200 placeholder:text-arcade-muted disabled:opacity-50"
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  background: "rgba(13,13,26,0.9)",
                  border: inputFocused ? "1px solid #00f5ff" : "1px solid #1e1e3a",
                  boxShadow: inputFocused
                    ? "0 0 12px rgba(0,245,255,0.2), inset 0 0 8px rgba(0,245,255,0.04)"
                    : "none",
                }}
              />
            </div>

            {/* Add button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-shrink-0 px-5 py-3 text-sm font-bold tracking-[0.2em] uppercase transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                color: "#ff2d78",
                background: canSubmit ? "rgba(255,45,120,0.12)" : "rgba(255,45,120,0.06)",
                border: "1px solid #ff2d78",
                animation:
                  canSubmit && !submitting ? "pulse-glow-magenta 2s ease-in-out infinite" : "none",
                textShadow: canSubmit ? "0 0 6px rgba(255,45,120,0.6)" : "none",
              }}
            >
              {submitting ? "···" : "ADD"}
            </button>
          </div>
        </form>

        {/* ── Quest count label ── */}
        {!loading && todos.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-arcade-subdued tracking-[0.35em] uppercase">Active</span>
            <div className="flex-1 h-px bg-arcade-border" />
            <span
              className="text-xs font-bold"
              style={{
                color: "#00f5ff",
                textShadow: "0 0 6px rgba(0,245,255,0.7)",
              }}
            >
              {activeCount}/{todos.length}
            </span>
          </div>
        )}

        {/* ── Todo list ── */}
        <div className="space-y-2">
          {loading ? (
            <LoadingDots />
          ) : todos.length === 0 ? (
            <EmptyState />
          ) : (
            todos.map((todo, i) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                index={i}
                deleting={deletingId === todo.id}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="mt-14 text-center">
          <div className="text-xs text-arcade-dim tracking-[0.4em] uppercase">Orchestrate v0.1</div>
        </footer>
      </div>
    </div>
  );
}
