import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Flame,
  Clock,
  TrendingUp,
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  Users,
  Shield,
  Plus,
  Calendar,
} from "lucide-react";
import type { SortMode, TimeFilter } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { sortPosts, formatCakeDay } from "~/utils";
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

export default function SubredditPage() {
  const { subredditName } = useParams<{ subredditName: string }>();
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();

  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE);
  const [loading, setLoading] = useState(true);

  // Simulate brief loading on mount
  useState(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  });

  const subreddit = state.subreddits.find((s) => s.name === subredditName);

  const isMember = currentUser ? (subreddit?.members.includes(currentUser.id) ?? false) : false;
  const isModerator = currentUser
    ? (subreddit?.moderators.includes(currentUser.id) ?? false)
    : false;
  const isCreator = currentUser ? subreddit?.createdBy === currentUser.id : false;

  const filteredAndSorted = useMemo(() => {
    if (!subreddit) return [];
    let posts = state.posts.filter((p) => p.subredditId === subreddit.id);
    // Filter out removed posts unless user is a moderator
    if (!isModerator) {
      posts = posts.filter((p) => !p.removed);
    }
    return sortPosts(posts, sortMode, timeFilter);
  }, [state.posts, subreddit, sortMode, timeFilter, isModerator]);

  const visiblePosts = filteredAndSorted.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAndSorted.length;

  const handleJoinLeave = () => {
    if (!currentUser || !subreddit) return;
    if (isMember) {
      dispatch({
        type: "LEAVE_SUBREDDIT",
        subredditId: subreddit.id,
        userId: currentUser.id,
      });
    } else {
      dispatch({
        type: "JOIN_SUBREDDIT",
        subredditId: subreddit.id,
        userId: currentUser.id,
      });
    }
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + POSTS_PER_PAGE);
  };

  if (!subreddit) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Subreddit not found</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          r/{subredditName ?? "unknown"} does not exist.
        </p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-full bg-[#0079D3] px-6 py-2 text-sm font-bold text-white hover:bg-[#006cbd]"
        >
          Go Home
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <PostSkeleton />
      </div>
    );
  }

  // Resolve moderator usernames
  const moderatorUsers = subreddit.moderators
    .map((modId) => state.users.find((u) => u.id === modId))
    .filter((u) => u !== undefined);

  return (
    <div>
      {/* Banner */}
      <div
        className="h-24 w-full sm:h-32"
        style={{ backgroundColor: subreddit.banner || "#0079D3" }}
      />

      {/* Subreddit header */}
      <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-4xl items-end gap-4 px-4 pb-3">
          <div className="-mt-4 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-gray-100 text-3xl dark:border-gray-800 dark:bg-gray-700 sm:h-20 sm:w-20 sm:text-4xl">
            {subreddit.icon || "🌐"}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-3 py-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                r/{subreddit.name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {subreddit.members.length.toLocaleString()}{" "}
                {subreddit.members.length === 1 ? "member" : "members"}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              {currentUser && !isCreator && (
                <button
                  onClick={handleJoinLeave}
                  className={`rounded-full px-5 py-1.5 text-sm font-bold transition-colors ${
                    isMember
                      ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      : "bg-[#0079D3] text-white hover:bg-[#006cbd]"
                  }`}
                >
                  {isMember ? "Joined" : "Join"}
                </button>
              )}
              <Link
                to={`/submit?subreddit=${subreddit.name}`}
                className="flex items-center gap-1 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Plus size={16} />
                Create Post
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto flex max-w-4xl gap-6 px-4 py-6">
        {/* Left column - posts */}
        <div className="min-w-0 flex-1">
          {/* Description (mobile only) */}
          {subreddit.description !== "" && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300 lg:hidden">
              {subreddit.description}
            </p>
          )}

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

            {sortMode === "top" && (
              <div className="relative ml-auto">
                <label className="sr-only" htmlFor="sub-time-filter">
                  Time filter
                </label>
                <div className="relative">
                  <select
                    id="sub-time-filter"
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
              <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
                No posts to show
              </p>
              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                Be the first to post in r/{subreddit.name}!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visiblePosts.map((post) => (
                <PostCard key={post.id} post={post} showSubreddit={false} />
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

        {/* Right sidebar (hidden on mobile) */}
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {/* About header */}
            <div className="rounded-t-lg bg-[#0079D3] px-4 py-3">
              <h2 className="text-sm font-bold text-white">About Community</h2>
            </div>

            <div className="flex flex-col gap-4 p-4">
              {/* Description */}
              {subreddit.description !== "" && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{subreddit.description}</p>
              )}

              {/* Created date */}
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Calendar size={14} />
                <span>Created {formatCakeDay(subreddit.createdAt)}</span>
              </div>

              {/* Member count */}
              <div className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-gray-500 dark:text-gray-400" />
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {subreddit.members.length.toLocaleString()}
                </span>
                <span className="text-gray-500 dark:text-gray-400">Members</span>
              </div>

              {/* Create post CTA */}
              <Link
                to={`/submit?subreddit=${subreddit.name}`}
                className="block w-full rounded-full bg-[#0079D3] py-2 text-center text-sm font-bold text-white transition-colors hover:bg-[#006cbd]"
              >
                Create Post
              </Link>

              {/* Rules */}
              {subreddit.rules.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Rules
                  </h3>
                  <ol className="flex flex-col gap-2">
                    {subreddit.rules.map((rule, ruleIdx) => (
                      <li
                        key={rule.title}
                        className="border-b border-gray-100 pb-2 last:border-0 dark:border-gray-700"
                      >
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {ruleIdx + 1}. {rule.title}
                        </p>
                        {rule.description !== "" && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {rule.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Flairs */}
              {subreddit.flairs.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Flairs
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {subreddit.flairs.map((flair) => (
                      <span
                        key={flair}
                        className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      >
                        {flair}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Moderators */}
              {moderatorUsers.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Moderators
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {moderatorUsers.map((mod) => (
                      <li key={mod.id}>
                        <Link
                          to={`/u/${mod.username}`}
                          className="flex items-center gap-1.5 text-sm text-[#0079D3] hover:underline dark:text-[#4db8ff]"
                        >
                          <Shield size={12} />
                          u/{mod.username}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Mod Tools link */}
              {isModerator && (
                <Link
                  to={`/r/${subreddit.name}/mod`}
                  className="flex items-center justify-center gap-2 rounded-full border border-gray-300 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Shield size={14} />
                  Mod Tools
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
