import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Bell,
  User,
  LogOut,
  Bookmark,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import { useStore, useCurrentUser } from "~/store";

// ---------------------------------------------------------------------------
// Header Search with autocomplete
// ---------------------------------------------------------------------------

function HeaderSearch() {
  const navigate = useNavigate();
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    if (query.trim().length === 0) return { subreddits: [], users: [] };
    const q = query.toLowerCase();
    const subreddits = state.subreddits.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
    const users = state.users.filter((u) => u.username.toLowerCase().includes(q)).slice(0, 5);
    return { subreddits, users };
  }, [query, state.subreddits, state.users]);

  const hasResults = results.subreddits.length > 0 || results.users.length > 0;
  const showDropdown = focused && query.trim().length > 0 && hasResults;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (query.trim() === "") return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Search Reddat"
            className="w-full rounded-full border border-gray-300 bg-gray-100 py-2 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:bg-white focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:bg-gray-800"
          />
        </div>
      </form>

      {showDropdown && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {results.subreddits.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[10px] font-bold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Communities
              </div>
              {results.subreddits.map((sub) => (
                <Link
                  key={sub.id}
                  to={`/r/${sub.name}`}
                  onClick={() => {
                    setFocused(false);
                    setQuery("");
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span className="text-base">{sub.icon}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">r/{sub.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {sub.members.length} members
                  </span>
                </Link>
              ))}
            </div>
          )}
          {results.users.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[10px] font-bold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                People
              </div>
              {results.users.map((user) => (
                <Link
                  key={user.id}
                  to={`/u/${user.username}`}
                  onClick={() => {
                    setFocused(false);
                    setQuery("");
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <User size={14} className="text-gray-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    u/{user.username}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Dropdown Menu
// ---------------------------------------------------------------------------

function UserDropdown() {
  const { dispatch, state } = useStore();
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!currentUser) return null;

  const isDark = state.theme === "dark";

  const handleThemeToggle = () => {
    dispatch({
      type: "SET_THEME",
      theme: isDark ? "light" : "dark",
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500"
      >
        <span className="text-base">{currentUser.avatar || "\uD83D\uDE36"}</span>
        <span className="hidden sm:inline">{currentUser.username}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <Link
            to={`/u/${currentUser.username}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <User size={16} />
            Profile
          </Link>
          <Link
            to="/saved"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Bookmark size={16} />
            Saved
          </Link>
          <button
            onClick={() => {
              handleThemeToggle();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Settings size={16} />
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700" />
          <button
            onClick={() => {
              dispatch({ type: "LOGOUT" });
              setOpen(false);
              navigate("/");
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Content (shared between desktop sidebar & mobile drawer)
// ---------------------------------------------------------------------------

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { state } = useStore();
  const currentUser = useCurrentUser();

  // Subreddits the user has joined
  const mySubreddits = useMemo(() => {
    if (!currentUser) return [];
    return state.subreddits.filter((s) => s.members.includes(currentUser.id));
  }, [state.subreddits, currentUser]);

  // Trending: top subreddits by member count
  const trending = useMemo(() => {
    return [...state.subreddits]
      .toSorted((a, b) => b.members.length - a.members.length)
      .slice(0, 5);
  }, [state.subreddits]);

  return (
    <div className="flex flex-col gap-4">
      {/* My Communities */}
      {currentUser && (
        <div>
          <h3 className="mb-2 px-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            My Communities
          </h3>
          {mySubreddits.length === 0 ? (
            <p className="px-3 text-xs text-gray-400 dark:text-gray-500">
              You haven&apos;t joined any communities yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {mySubreddits.map((sub) => (
                <li key={sub.id}>
                  <Link
                    to={`/r/${sub.name}`}
                    onClick={onNavigate}
                    className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <span>{sub.icon}</span>
                    <span>r/{sub.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/create-community"
            onClick={onNavigate}
            className="mt-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-[#ff4500] hover:bg-orange-50 dark:hover:bg-orange-900/20"
          >
            <Plus size={16} />
            Create Community
          </Link>
        </div>
      )}

      {/* Trending */}
      <div>
        <h3 className="mb-2 px-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Trending
        </h3>
        {trending.length === 0 ? (
          <p className="px-3 text-xs text-gray-400 dark:text-gray-500">No communities yet.</p>
        ) : (
          <ul className="flex flex-col">
            {trending.map((sub) => (
              <li key={sub.id}>
                <Link
                  to={`/r/${sub.name}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <TrendingUp size={14} className="text-[#ff4500]" />
                  <span>r/{sub.name}</span>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                    {sub.members.length}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function Layout() {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDark = state.theme === "dark";

  // Unread messages count
  const unreadCount = useMemo(() => {
    if (!currentUser) return 0;
    return state.messages.filter((m) => m.toId === currentUser.id && !m.read).length;
  }, [state.messages, currentUser]);

  const handleThemeToggle = () => {
    dispatch({
      type: "SET_THEME",
      theme: isDark ? "light" : "dark",
    });
  };

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* ------------------------------------------------------------------ */}
      {/* Fixed Header */}
      {/* ------------------------------------------------------------------ */}
      <header className="fixed top-0 right-0 left-0 z-40 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex h-12 max-w-screen-xl items-center gap-3 px-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Logo */}
          <Link to="/" className="mr-2 flex shrink-0 items-center gap-1 text-xl font-bold">
            <span className="text-[#ff4500]">R</span>
            <span className="hidden sm:inline">
              <span className="text-[#ff4500]">eddat</span>
            </span>
          </Link>

          {/* Search */}
          <HeaderSearch />

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={handleThemeToggle}
              className="rounded-full p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {currentUser ? (
              <>
                {/* Create post */}
                <Link
                  to="/submit"
                  className="rounded-full p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  aria-label="Create post"
                >
                  <Plus size={18} />
                </Link>

                {/* Notifications */}
                <Link
                  to="/messages"
                  className="relative rounded-full p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  aria-label="Messages"
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff4500] px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>

                {/* User dropdown */}
                <UserDropdown />
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full border border-[#ff4500] px-4 py-1 text-sm font-medium text-[#ff4500] hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  Log In
                </Link>
                <Link
                  to="/signup"
                  className="hidden rounded-full bg-[#ff4500] px-4 py-1 text-sm font-medium text-white hover:bg-[#e03d00] sm:inline-block"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile slide-in drawer */}
      {/* ------------------------------------------------------------------ */}
      {mobileMenuOpen && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={closeMobileMenu} />
          {/* Drawer */}
          <aside className="fixed top-12 bottom-0 left-0 z-30 w-64 overflow-y-auto border-r border-gray-200 bg-white px-2 py-4 dark:border-gray-700 dark:bg-gray-800 md:hidden">
            <SidebarContent onNavigate={closeMobileMenu} />
          </aside>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main content area */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-auto flex max-w-screen-xl gap-6 px-3 pt-14">
        {/* Desktop Sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-4 md:block">
          <SidebarContent onNavigate={() => {}} />
        </aside>

        {/* Page content */}
        <main className="min-w-0 flex-1 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
