import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search,
  Users,
  FileText,
  Globe,
  UserPlus,
  UserMinus,
  Star,
  ChevronDown,
} from "lucide-react";
import { useStore, useCurrentUser } from "~/store";
import { calculateKarma } from "~/utils";
import PostCard from "~/components/PostCard";
import { useToast } from "~/components/ui";

type SearchTab = "posts" | "communities" | "users";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const toast = useToast();

  const query = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(query);
  const [activeTab, setActiveTab] = useState<SearchTab>("posts");
  const [subredditFilter, setSubredditFilter] = useState("");

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed === "") return;
    setSearchParams({ q: trimmed });
  };

  const lowerQuery = query.toLowerCase();

  // Search posts
  const matchedPosts = useMemo(() => {
    if (lowerQuery === "") return [];
    let posts = state.posts.filter(
      (p) =>
        !p.removed &&
        (p.title.toLowerCase().includes(lowerQuery) || p.body.toLowerCase().includes(lowerQuery)),
    );

    if (subredditFilter !== "") {
      posts = posts.filter((p) => p.subredditId === subredditFilter);
    }

    return posts;
  }, [state.posts, lowerQuery, subredditFilter]);

  // Search communities
  const matchedCommunities = useMemo(() => {
    if (lowerQuery === "") return [];
    return state.subreddits.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery),
    );
  }, [state.subreddits, lowerQuery]);

  // Search users
  const matchedUsers = useMemo(() => {
    if (lowerQuery === "") return [];
    return state.users.filter((u) => u.username.toLowerCase().includes(lowerQuery));
  }, [state.users, lowerQuery]);

  const handleJoinLeave = (subredditId: string, isMember: boolean) => {
    if (!currentUser) return;
    if (isMember) {
      dispatch({
        type: "LEAVE_SUBREDDIT",
        subredditId,
        userId: currentUser.id,
      });
    } else {
      dispatch({
        type: "JOIN_SUBREDDIT",
        subredditId,
        userId: currentUser.id,
      });
    }
  };

  const handleFollowToggle = (targetId: string, isFollowing: boolean) => {
    if (!currentUser) return;
    if (isFollowing) {
      dispatch({
        type: "UNFOLLOW_USER",
        userId: currentUser.id,
        targetId,
      });
      toast.info("Unfollowed");
    } else {
      dispatch({
        type: "FOLLOW_USER",
        userId: currentUser.id,
        targetId,
      });
      toast.success("Following");
    }
  };

  const tabCounts: Record<SearchTab, number> = {
    posts: matchedPosts.length,
    communities: matchedCommunities.length,
    users: matchedUsers.length,
  };

  const tabs: { key: SearchTab; label: string; icon: typeof FileText }[] = [
    { key: "posts", label: "Posts", icon: FileText },
    { key: "communities", label: "Communities", icon: Globe },
    { key: "users", label: "Users", icon: Users },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Search Input */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
            placeholder="Search Reddat..."
            className="w-full rounded-full border border-gray-300 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-2 focus:ring-[#ff4500]/30 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
      </form>

      {/* No query state */}
      {query === "" && (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
          <Search size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
            Enter a search term above
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Search for posts, communities, or users.
          </p>
        </div>
      )}

      {/* Results */}
      {query !== "" && (
        <>
          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "border-[#ff4500] text-[#ff4500]"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      activeTab === tab.key
                        ? "bg-[#ff4500]/10 text-[#ff4500]"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {tabCounts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Posts Tab */}
          {activeTab === "posts" && (
            <div className="flex flex-col gap-3">
              {/* Subreddit filter */}
              {state.subreddits.length > 0 && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="sub-filter"
                    className="text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Filter by community:
                  </label>
                  <div className="relative">
                    <select
                      id="sub-filter"
                      value={subredditFilter}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setSubredditFilter(e.target.value)
                      }
                      className="appearance-none rounded-full border border-gray-300 bg-white py-1 pr-7 pl-3 text-xs font-medium text-gray-700 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    >
                      <option value="">All communities</option>
                      {state.subreddits.map((s) => (
                        <option key={s.id} value={s.id}>
                          r/{s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                </div>
              )}

              {matchedPosts.length === 0 ? (
                <NoResults query={query} />
              ) : (
                matchedPosts.map((post) => (
                  <PostCard key={post.id} post={post} showSubreddit={true} />
                ))
              )}
            </div>
          )}

          {/* Communities Tab */}
          {activeTab === "communities" && (
            <div className="flex flex-col gap-3">
              {matchedCommunities.length === 0 ? (
                <NoResults query={query} />
              ) : (
                matchedCommunities.map((sub) => {
                  const isMember = currentUser != null && sub.members.includes(currentUser.id);
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                    >
                      {/* Icon */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xl dark:bg-gray-700">
                        {sub.icon}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/r/${sub.name}`}
                          className="text-sm font-bold text-gray-900 hover:underline dark:text-gray-100"
                        >
                          r/{sub.name}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                          {sub.description}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {sub.members.length} {sub.members.length === 1 ? "member" : "members"}
                        </p>
                      </div>

                      {/* Join/Leave */}
                      {currentUser && (
                        <button
                          onClick={() => handleJoinLeave(sub.id, isMember)}
                          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                            isMember
                              ? "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                              : "bg-[#ff4500] text-white hover:bg-[#e03d00]"
                          }`}
                        >
                          {isMember ? "Joined" : "Join"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div className="flex flex-col gap-3">
              {matchedUsers.length === 0 ? (
                <NoResults query={query} />
              ) : (
                matchedUsers.map((user) => {
                  const userKarma = calculateKarma(state.posts, state.comments, user.id);
                  const isFollowing =
                    currentUser != null && currentUser.following.includes(user.id);
                  const isSelf = currentUser != null && currentUser.id === user.id;

                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                    >
                      {/* Avatar */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xl dark:bg-gray-700">
                        {user.avatar || "\u{1F636}"}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/u/${user.username}`}
                          className="text-sm font-bold text-gray-900 hover:underline dark:text-gray-100"
                        >
                          u/{user.username}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Star size={12} className="text-[#ff4500]" />
                          {userKarma} karma
                        </div>
                      </div>

                      {/* Follow */}
                      {currentUser && !isSelf && (
                        <button
                          onClick={() => handleFollowToggle(user.id, isFollowing)}
                          className={`flex shrink-0 items-center gap-1 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                            isFollowing
                              ? "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                              : "bg-[#ff4500] text-white hover:bg-[#e03d00]"
                          }`}
                        >
                          {isFollowing ? (
                            <>
                              <UserMinus size={12} />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus size={12} />
                              Follow
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No results found for &ldquo;{query}&rdquo;
      </p>
    </div>
  );
}
