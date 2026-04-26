import { Gamepad2 } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", color: "#e2e8f0" }}>
      {/* Top navigation */}
      <nav
        style={{
          background: "rgba(15, 15, 25, 0.95)",
          borderBottom: "1px solid rgba(167, 139, 250, 0.2)",
          backdropFilter: "blur(12px)",
        }}
        className="sticky top-0 z-50"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center gap-3">
            <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div
                style={{
                  background: "linear-gradient(135deg, #a78bfa, #7c3aed)",
                  boxShadow: "0 0 12px rgba(167, 139, 250, 0.5)",
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg"
              >
                <Gamepad2 size={16} className="text-white" />
              </div>
              <span
                className="text-lg font-bold tracking-wide"
                style={{
                  background: "linear-gradient(90deg, #a78bfa, #c4b5fd)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Arcade
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
