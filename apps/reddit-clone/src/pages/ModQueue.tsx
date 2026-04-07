import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Shield,
  CheckCircle,
  XCircle,
  UserX,
  UserCheck,
  Plus,
  Trash2,
  AlertTriangle,
  Settings,
  Flag,
  MessageSquare,
  Tag,
  BookOpen,
} from "lucide-react";
import type { SubredditRule } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { timeAgo, truncate } from "~/utils";
import { useToast } from "~/components/ui";

type ModTab = "reported-posts" | "reported-comments" | "banned-users" | "settings";

const MOD_TABS: { key: ModTab; label: string; icon: typeof Flag }[] = [
  { key: "reported-posts", label: "Reported Posts", icon: Flag },
  { key: "reported-comments", label: "Reported Comments", icon: MessageSquare },
  { key: "banned-users", label: "Banned Users", icon: UserX },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function ModQueue() {
  const { subredditName } = useParams<{ subredditName: string }>();
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<ModTab>("reported-posts");

  // Ban user form state
  const [banUsername, setBanUsername] = useState("");
  const [banError, setBanError] = useState("");

  // Rules editing state
  const [newRuleTitle, setNewRuleTitle] = useState("");
  const [newRuleDescription, setNewRuleDescription] = useState("");

  // Flair editing state
  const [newFlair, setNewFlair] = useState("");

  // Find subreddit
  const subreddit = useMemo(
    () => state.subreddits.find((s) => s.name === subredditName),
    [state.subreddits, subredditName],
  );

  // Check if current user is a moderator
  const isMod =
    currentUser != null && subreddit != null && subreddit.moderators.includes(currentUser.id);

  // Reported posts in this subreddit
  const reportedPosts = useMemo(() => {
    if (!subreddit) return [];
    return state.posts.filter((p) => p.subredditId === subreddit.id && p.reported && !p.removed);
  }, [state.posts, subreddit]);

  // Reported comments on posts in this subreddit
  const reportedComments = useMemo(() => {
    if (!subreddit) return [];
    const subredditPostIds = new Set(
      state.posts.filter((p) => p.subredditId === subreddit.id).map((p) => p.id),
    );
    return state.comments.filter((c) => subredditPostIds.has(c.postId) && c.reported && !c.removed);
  }, [state.posts, state.comments, subreddit]);

  // Banned users
  const bannedUsers = useMemo(() => {
    if (!subreddit) return [];
    return subreddit.bannedUsers
      .map((userId) => state.users.find((u) => u.id === userId))
      .filter((u): u is NonNullable<typeof u> => u != null);
  }, [state.users, subreddit]);

  const getUsername = (userId: string): string => {
    const user = state.users.find((u) => u.id === userId);
    return user?.username ?? "[deleted]";
  };

  const getPostTitle = (postId: string): string => {
    const post = state.posts.find((p) => p.id === postId);
    return post?.title ?? "[deleted]";
  };

  // Action handlers
  const handleApprovePost = (postId: string) => {
    dispatch({ type: "APPROVE_POST", postId });
    toast.success("Post approved");
  };

  const handleRemovePost = (postId: string) => {
    dispatch({ type: "REMOVE_POST", postId });
    toast.info("Post removed");
  };

  const handleApproveComment = (commentId: string) => {
    dispatch({ type: "APPROVE_COMMENT", commentId });
    toast.success("Comment approved");
  };

  const handleRemoveComment = (commentId: string) => {
    dispatch({ type: "REMOVE_COMMENT", commentId });
    toast.info("Comment removed");
  };

  const handleBanUser = () => {
    if (!subreddit) return;
    const trimmed = banUsername.trim();
    if (trimmed === "") {
      setBanError("Username is required");
      return;
    }

    const userToBan = state.users.find((u) => u.username.toLowerCase() === trimmed.toLowerCase());
    if (!userToBan) {
      setBanError(`User "${trimmed}" not found`);
      return;
    }

    if (subreddit.bannedUsers.includes(userToBan.id)) {
      setBanError("User is already banned");
      return;
    }

    if (!subreddit.members.includes(userToBan.id)) {
      setBanError("User is not a member of this community");
      return;
    }

    if (subreddit.moderators.includes(userToBan.id)) {
      setBanError("Cannot ban a moderator");
      return;
    }

    dispatch({
      type: "BAN_USER",
      subredditId: subreddit.id,
      userId: userToBan.id,
    });
    setBanUsername("");
    setBanError("");
    toast.success(`u/${userToBan.username} has been banned`);
  };

  const handleUnbanUser = (userId: string) => {
    if (!subreddit) return;
    dispatch({
      type: "UNBAN_USER",
      subredditId: subreddit.id,
      userId,
    });
    toast.info("User unbanned");
  };

  const handleAddRule = () => {
    if (!subreddit) return;
    const title = newRuleTitle.trim();
    const description = newRuleDescription.trim();
    if (title === "") return;

    const newRules: SubredditRule[] = [...subreddit.rules, { title, description }];
    dispatch({
      type: "UPDATE_SUBREDDIT_RULES",
      subredditId: subreddit.id,
      rules: newRules,
    });
    setNewRuleTitle("");
    setNewRuleDescription("");
    toast.success("Rule added");
  };

  const handleRemoveRule = (index: number) => {
    if (!subreddit) return;
    const newRules = subreddit.rules.filter((_, i) => i !== index);
    dispatch({
      type: "UPDATE_SUBREDDIT_RULES",
      subredditId: subreddit.id,
      rules: newRules,
    });
    toast.info("Rule removed");
  };

  const handleAddFlair = () => {
    if (!subreddit) return;
    const flair = newFlair.trim();
    if (flair === "") return;
    if (subreddit.flairs.includes(flair)) {
      toast.error("Flair already exists");
      return;
    }

    const newFlairs = [...subreddit.flairs, flair];
    dispatch({
      type: "UPDATE_SUBREDDIT_FLAIRS",
      subredditId: subreddit.id,
      flairs: newFlairs,
    });
    setNewFlair("");
    toast.success("Flair added");
  };

  const handleRemoveFlair = (flair: string) => {
    if (!subreddit) return;
    const newFlairs = subreddit.flairs.filter((f) => f !== flair);
    dispatch({
      type: "UPDATE_SUBREDDIT_FLAIRS",
      subredditId: subreddit.id,
      flairs: newFlairs,
    });
    toast.info("Flair removed");
  };

  // Not found
  if (!subreddit) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Community not found</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          The community r/{subredditName} does not exist.
        </p>
        <Link
          to="/"
          className="mt-4 inline-block text-sm font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
        >
          Go back to home
        </Link>
      </div>
    );
  }

  // Access denied
  if (!isMod) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Shield size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Access Denied</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          You must be a moderator of r/{subreddit.name} to access the mod queue.
        </p>
        <Link
          to={`/r/${subreddit.name}`}
          className="mt-4 inline-block text-sm font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
        >
          Go to r/{subreddit.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Shield size={24} className="text-[#ff4500]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mod Queue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">r/{subreddit.name}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {MOD_TABS.map((tab) => {
          const Icon = tab.icon;
          let count: number | null = null;
          if (tab.key === "reported-posts") count = reportedPosts.length;
          if (tab.key === "reported-comments") count = reportedComments.length;
          if (tab.key === "banned-users") count = bannedUsers.length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-[#ff4500] text-[#ff4500]"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {count != null && count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeTab === tab.key
                      ? "bg-[#ff4500]/10 text-[#ff4500]"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Reported Posts Tab */}
      {activeTab === "reported-posts" && (
        <div className="flex flex-col gap-3">
          {reportedPosts.length === 0 ? (
            <EmptyQueue message="No reported posts. All clear!" />
          ) : (
            reportedPosts.map((post) => (
              <div
                key={post.id}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    u/{getUsername(post.authorId)}
                  </span>
                  <span>&middot;</span>
                  <span>{timeAgo(post.createdAt)}</span>
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    <AlertTriangle size={10} />
                    {post.reportReasons.length}{" "}
                    {post.reportReasons.length === 1 ? "report" : "reports"}
                  </span>
                </div>

                <Link
                  to={`/r/${subreddit.name}/post/${post.id}`}
                  className="mb-2 block text-sm font-medium text-gray-900 hover:text-[#0079D3] dark:text-gray-100 dark:hover:text-[#4db8ff]"
                >
                  {post.title}
                </Link>

                {/* Report reasons */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {post.reportReasons.map((reason) => (
                    <span
                      key={`${post.id}-${reason}`}
                      className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400"
                    >
                      {reason}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprovePost(post.id)}
                    className="flex items-center gap-1 rounded-full border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    <CheckCircle size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleRemovePost(post.id)}
                    className="flex items-center gap-1 rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <XCircle size={14} />
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Reported Comments Tab */}
      {activeTab === "reported-comments" && (
        <div className="flex flex-col gap-3">
          {reportedComments.length === 0 ? (
            <EmptyQueue message="No reported comments. All clear!" />
          ) : (
            reportedComments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    u/{getUsername(comment.authorId)}
                  </span>
                  <span>&middot;</span>
                  <span>on &ldquo;{truncate(getPostTitle(comment.postId), 40)}&rdquo;</span>
                  <span>&middot;</span>
                  <span>{timeAgo(comment.createdAt)}</span>
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    <AlertTriangle size={10} />
                    {comment.reportReasons.length}{" "}
                    {comment.reportReasons.length === 1 ? "report" : "reports"}
                  </span>
                </div>

                <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                  {truncate(comment.body, 200)}
                </p>

                {/* Report reasons */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {comment.reportReasons.map((reason) => (
                    <span
                      key={`${comment.id}-${reason}`}
                      className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400"
                    >
                      {reason}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveComment(comment.id)}
                    className="flex items-center gap-1 rounded-full border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    <CheckCircle size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleRemoveComment(comment.id)}
                    className="flex items-center gap-1 rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <XCircle size={14} />
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Banned Users Tab */}
      {activeTab === "banned-users" && (
        <div className="flex flex-col gap-4">
          {/* Ban user form */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Ban a User
            </h3>
            {banError !== "" && (
              <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {banError}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={banUsername}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setBanUsername(e.target.value);
                  setBanError("");
                }}
                placeholder="Username to ban"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                onClick={handleBanUser}
                className="flex items-center gap-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600"
              >
                <UserX size={14} />
                Ban
              </button>
            </div>
          </div>

          {/* Banned users list */}
          {bannedUsers.length === 0 ? (
            <EmptyQueue message="No banned users." />
          ) : (
            <div className="flex flex-col gap-2">
              {bannedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg dark:bg-gray-700">
                      {user.avatar || "\u{1F636}"}
                    </div>
                    <Link
                      to={`/u/${user.username}`}
                      className="text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
                    >
                      u/{user.username}
                    </Link>
                  </div>
                  <button
                    onClick={() => handleUnbanUser(user.id)}
                    className="flex items-center gap-1 rounded-full border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    <UserCheck size={14} />
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="flex flex-col gap-6">
          {/* Rules section */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen size={18} className="text-[#ff4500]" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Community Rules
              </h3>
            </div>

            {/* Existing rules */}
            {subreddit.rules.length === 0 ? (
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">No rules defined yet.</p>
            ) : (
              <div className="mb-4 flex flex-col gap-2">
                {subreddit.rules.map((rule, ruleIdx) => (
                  <div
                    key={rule.title}
                    className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {ruleIdx + 1}. {rule.title}
                      </p>
                      {rule.description !== "" && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {rule.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveRule(ruleIdx)}
                      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      aria-label={`Remove rule ${String(ruleIdx + 1)}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add rule form */}
            <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
              <input
                type="text"
                value={newRuleTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewRuleTitle(e.target.value)
                }
                placeholder="Rule title"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <input
                type="text"
                value={newRuleDescription}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewRuleDescription(e.target.value)
                }
                placeholder="Rule description (optional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                onClick={handleAddRule}
                disabled={newRuleTitle.trim() === ""}
                className="flex items-center gap-1 self-start rounded-full bg-[#ff4500] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#e03d00] disabled:opacity-50"
              >
                <Plus size={14} />
                Add Rule
              </button>
            </div>
          </div>

          {/* Flairs section */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <Tag size={18} className="text-[#ff4500]" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Post Flairs
              </h3>
            </div>

            {/* Existing flairs */}
            {subreddit.flairs.length === 0 ? (
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                No flairs defined yet.
              </p>
            ) : (
              <div className="mb-4 flex flex-wrap gap-2">
                {subreddit.flairs.map((flair) => (
                  <span
                    key={flair}
                    className="group flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  >
                    {flair}
                    <button
                      onClick={() => handleRemoveFlair(flair)}
                      className="rounded-full p-0.5 opacity-60 transition-opacity hover:bg-blue-200 hover:opacity-100 dark:hover:bg-blue-800"
                      aria-label={`Remove flair ${flair}`}
                    >
                      <XCircle size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add flair form */}
            <div className="flex gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
              <input
                type="text"
                value={newFlair}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFlair(e.target.value)}
                placeholder="New flair name"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddFlair();
                  }
                }}
              />
              <button
                onClick={handleAddFlair}
                disabled={newFlair.trim() === ""}
                className="flex items-center gap-1 rounded-full bg-[#ff4500] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#e03d00] disabled:opacity-50"
              >
                <Plus size={14} />
                Add Flair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyQueue({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
      <CheckCircle size={32} className="mx-auto mb-3 text-green-400 dark:text-green-500" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
