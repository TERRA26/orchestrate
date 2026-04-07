import { useState, useMemo } from "react";
import { useLocation, Link } from "react-router-dom";
import { Flame, Clock, TrendingUp, ArrowUpDown, BarChart3, ChevronDown } from "lucide-react";
import type { SortMode, TimeFilter } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { sortPosts } from "~/utils";
import PostCard from "~/components/PostCard";
import { PostSkeleton } from "~/components/ui";

const SORT_OPTIONS: { mode: SortMode; label: string; icon: typeof Flame }[] = [
  { mode: "hot", label: "Hot", icon: Flame },
  { mode: "new", label: "New", icon: Clock },
  { mode: "top", label: "Top", icon: TrendingUp },
  { mode: "rising", label: "Rising", icon: BarChart3 },
  { mode: "controversial", label: "Controversial", icon: ArrowUpDown },
];

const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "hour", label: "Hour" },
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All Time" },
];

const POSTS_PER_PAGE = 10;

export default function Home() {
  const { state } = useStore();
  const currentUser = useCurrentUser();
  const location = useLocation();

  const isPopular = location.pathname === "/popular";

  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE);
  const [loading, setLoading] = useState(true);

  // Simulate brief loading on mount
  useState(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  });

  const filteredAndSorted = useMemo(() => {
    let posts = state.posts.filter((p) => !p.removed);

    if (!isPopular && currentUser) {
      const joinedSubredditIds = new Set(
        state.subreddits.filter((s) => s.members.includes(currentUser.id)).map((s) => s.id),
      );
      posts = posts.filter((p) => joinedSubredditIds.has(p.subredditId));
    }

    return sortPosts(posts, sortMode, timeFilter);
  }, [state.posts, state.subreddits, currentUser, isPopular, sortMode, timeFilter]);

  const visiblePosts = filteredAndSorted.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAndSorted.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + POSTS_PER_PAGE);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <PostSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Feed toggle tabs */}
      <div className="mb-4 flex gap-2">
        <Link
          to="/"
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            !isPopular
              ? "bg-[#ff4500] text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Home
        </Link>
        <Link
          to="/popular"
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isPopular
              ? "bg-[#ff4500] text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Popular
        </Link>
      </div>

      {/* Sort bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
        {SORT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.mode}
              onClick={() => {
                setSortMode(opt.mode);
                setVisibleCount(POSTS_PER_PAGE);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                sortMode === opt.mode
                  ? "bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-gray-100"
                  : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              <Icon size={16} />
              {opt.label}
            </button>
          );
        })}

        {/* Time filter dropdown (visible when sort is "top") */}
        {sortMode === "top" && (
          <div className="relative ml-auto">
            <label className="sr-only" htmlFor="time-filter">
              Time filter
            </label>
            <div className="relative">
              <select
                id="time-filter"
                value={timeFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const val = e.target.value as TimeFilter;
                  setTimeFilter(val);
                  setVisibleCount(POSTS_PER_PAGE);
                }}
                className="appearance-none rounded-full border border-gray-300 bg-white py-1.5 pr-8 pl-3 text-sm font-medium text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                {TIME_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Post list */}
      {visiblePosts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-lg font-medium text-gray-600 dark:text-gray-400">No posts to show</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            {!isPopular && currentUser
              ? "Join some communities to see posts in your home feed."
              : "There are no posts yet. Be the first to create one!"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visiblePosts.map((post) => (
            <PostCard key={post.id} post={post} showSubreddit={true} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleLoadMore}
            className="rounded-full border border-[#0079D3] px-8 py-2 text-sm font-bold text-[#0079D3] transition-colors hover:bg-[#0079D3]/10 dark:border-[#4db8ff] dark:text-[#4db8ff] dark:hover:bg-[#4db8ff]/10"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
