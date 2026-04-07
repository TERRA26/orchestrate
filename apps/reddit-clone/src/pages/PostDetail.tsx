import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowBigUp,
  ArrowBigDown,
  MessageSquare,
  Share2,
  Bookmark,
  BookmarkCheck,
  Award,
  Flag,
  Pencil,
  Trash2,
  ExternalLink,
  Repeat2,
  ChevronDown,
} from "lucide-react";
import type { Comment as CommentType, CommentSort } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { timeAgo, countComments } from "~/utils";
import CommentTree from "~/components/CommentTree";
import { Markdown, Modal, AwardModal, useToast } from "~/components/ui";

const COMMENT_SORT_OPTIONS: { value: CommentSort; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "top", label: "Top" },
  { value: "new", label: "New" },
  { value: "controversial", label: "Controversial" },
  { value: "old", label: "Old" },
];

export default function PostDetail() {
  const { subredditName: _subredditName, postId } = useParams<{
    subredditName: string;
    postId: string;
  }>();
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();

  const [commentSort, setCommentSort] = useState<CommentSort>("best");
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [crosspostModalOpen, setCrosspostModalOpen] = useState(false);
  const [crosspostSubredditId, setCrosspostSubredditId] = useState("");

  const post = postId ? state.posts.find((p) => p.id === postId) : undefined;
  const subreddit = post ? state.subreddits.find((s) => s.id === post.subredditId) : undefined;
  const author = post ? state.users.find((u) => u.id === post.authorId) : undefined;

  const commentCount = post ? countComments(state.comments, post.id) : 0;

  const isOwnPost =
    currentUser !== undefined && post !== undefined && currentUser.id === post.authorId;

  const isSaved =
    currentUser !== undefined && post !== undefined
      ? currentUser.savedPosts.includes(post.id)
      : false;

  const hasUpvoted =
    currentUser !== undefined && post !== undefined
      ? currentUser.upvotedPosts.includes(post.id)
      : false;

  const hasDownvoted =
    currentUser !== undefined && post !== undefined
      ? currentUser.downvotedPosts.includes(post.id)
      : false;

  const score = post ? post.upvotes - post.downvotes : 0;

  // Crosspost source
  const crosspostSource =
    post !== undefined && post.crosspostedFrom !== ""
      ? state.posts.find((p) => p.id === post.crosspostedFrom)
      : undefined;
  const crosspostSubreddit = crosspostSource
    ? state.subreddits.find((s) => s.id === crosspostSource.subredditId)
    : undefined;

  // Available subreddits for crossposting
  const availableSubreddits = useMemo(() => {
    if (!currentUser || !post) return [];
    return state.subreddits.filter(
      (s) =>
        s.id !== post.subredditId &&
        s.members.includes(currentUser.id) &&
        !s.bannedUsers.includes(currentUser.id),
    );
  }, [state.subreddits, currentUser, post]);

  // Add to browsing history when viewing
  useEffect(() => {
    if (currentUser && post) {
      dispatch({
        type: "ADD_TO_HISTORY",
        userId: currentUser.id,
        postId: post.id,
      });
    }
  }, [currentUser, post, dispatch]);

  if (!post || !subreddit) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Post not found</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          This post may have been deleted or the URL is incorrect.
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

  const authorName = author?.username ?? "[deleted]";

  const handleVote = (direction: "up" | "down") => {
    if (!currentUser) return;
    let voteDirection: "up" | "down" | "none";
    if (direction === "up") {
      voteDirection = hasUpvoted ? "none" : "up";
    } else {
      voteDirection = hasDownvoted ? "none" : "down";
    }
    dispatch({
      type: "VOTE_POST",
      postId: post.id,
      userId: currentUser.id,
      direction: voteDirection,
    });
  };

  const handleSaveToggle = () => {
    if (!currentUser) return;
    if (isSaved) {
      dispatch({ type: "UNSAVE_POST", userId: currentUser.id, postId: post.id });
    } else {
      dispatch({ type: "SAVE_POST", userId: currentUser.id, postId: post.id });
    }
  };

  const handleShare = () => {
    const permalink = `${window.location.origin}/r/${subreddit.name}/post/${post.id}`;
    navigator.clipboard.writeText(permalink).then(
      () => toast.success("Link copied to clipboard!"),
      () => toast.error("Failed to copy link"),
    );
  };

  const handleReport = () => {
    if (!currentUser) return;
    const reason = window.prompt("Reason for reporting this post:");
    if (reason != null && reason.trim() !== "") {
      dispatch({ type: "REPORT_POST", postId: post.id, reason: reason.trim() });
      toast.info("Post reported. Thank you.");
    }
  };

  const handleEdit = () => {
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditing(true);
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editTitle.trim() === "") return;
    dispatch({
      type: "EDIT_POST",
      postId: post.id,
      title: editTitle.trim(),
      body: editBody.trim(),
    });
    setEditing(false);
    toast.success("Post updated.");
  };

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    dispatch({ type: "DELETE_POST", postId: post.id });
    toast.info("Post deleted.");
    navigate(`/r/${subreddit.name}`);
  };

  const handleCommentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || commentText.trim() === "") return;
    const newComment: CommentType = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      postId: post.id,
      parentId: "",
      authorId: currentUser.id,
      body: commentText.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      upvotes: 1,
      downvotes: 0,
      awards: [],
      reported: false,
      reportReasons: [],
      removed: false,
    };
    dispatch({ type: "CREATE_COMMENT", comment: newComment });
    setCommentText("");
    toast.success("Comment posted!");
  };

  const handleCrosspost = () => {
    if (!currentUser || crosspostSubredditId === "") return;
    const newPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: post.type as "text" | "link" | "image",
      title: post.title,
      body: post.body,
      url: post.url,
      imageUrl: post.imageUrl,
      subredditId: crosspostSubredditId,
      authorId: currentUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      upvotes: 1,
      downvotes: 0,
      flair: "",
      spoiler: post.spoiler,
      nsfw: post.nsfw,
      awards: [],
      crosspostedFrom: post.id,
      reported: false,
      reportReasons: [],
      removed: false,
    };
    dispatch({ type: "CREATE_POST", post: newPost });
    setCrosspostModalOpen(false);
    setCrosspostSubredditId("");

    const targetSub = state.subreddits.find((s) => s.id === crosspostSubredditId);
    if (targetSub) {
      toast.success(`Crossposted to r/${targetSub.name}`);
      navigate(`/r/${targetSub.name}/post/${newPost.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex">
          {/* Vote column */}
          <div className="flex flex-col items-center gap-0.5 rounded-l-lg bg-gray-50 px-3 py-4 dark:bg-gray-800/60">
            <button
              onClick={() => handleVote("up")}
              className={`rounded p-1 transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/30 ${
                hasUpvoted ? "text-[#ff4500]" : "text-gray-400 dark:text-gray-500"
              }`}
              aria-label="Upvote"
            >
              <ArrowBigUp size={24} fill={hasUpvoted ? "currentColor" : "none"} />
            </button>
            <span
              className={`text-sm font-bold ${
                hasUpvoted
                  ? "text-[#ff4500]"
                  : hasDownvoted
                    ? "text-blue-500"
                    : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {score}
            </span>
            <button
              onClick={() => handleVote("down")}
              className={`rounded p-1 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30 ${
                hasDownvoted ? "text-blue-500" : "text-gray-400 dark:text-gray-500"
              }`}
              aria-label="Downvote"
            >
              <ArrowBigDown size={24} fill={hasDownvoted ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Main content */}
          <div className="min-w-0 flex-1 p-4">
            {/* Meta line */}
            <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Link
                to={`/r/${subreddit.name}`}
                className="font-bold text-gray-900 hover:underline dark:text-gray-100"
              >
                r/{subreddit.name}
              </Link>
              <span>&middot;</span>
              <span>
                Posted by{" "}
                <Link to={`/u/${authorName}`} className="hover:underline">
                  u/{authorName}
                </Link>
              </span>
              <span>&middot;</span>
              <span>{timeAgo(post.createdAt)}</span>
              {post.updatedAt !== post.createdAt && <span className="italic">(edited)</span>}
            </div>

            {/* Crosspost indicator */}
            {crosspostSource && crosspostSubreddit && (
              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Repeat2 size={12} />
                <span>
                  crossposted from{" "}
                  <Link
                    to={`/r/${crosspostSubreddit.name}/post/${crosspostSource.id}`}
                    className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
                  >
                    r/{crosspostSubreddit.name}
                  </Link>
                </span>
              </div>
            )}

            {/* Title */}
            {editing ? (
              <form onSubmit={handleEditSubmit} className="mt-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditTitle(e.target.value)
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-lg font-semibold text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  maxLength={300}
                />
                <textarea
                  value={editBody}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setEditBody(e.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  rows={6}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    className="rounded bg-[#ff4500] px-4 py-1.5 text-sm font-bold text-white hover:bg-[#e03d00]"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h1 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {post.spoiler && (
                    <span className="mr-2 rounded bg-gray-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      Spoiler
                    </span>
                  )}
                  {post.nsfw && (
                    <span className="mr-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      NSFW
                    </span>
                  )}
                  {post.flair !== "" && (
                    <span className="mr-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {post.flair}
                    </span>
                  )}
                  {post.title}
                </h1>

                {/* Post body */}
                {post.type === "text" && post.body !== "" && (
                  <div className="mt-3">
                    <Markdown content={post.body} />
                  </div>
                )}

                {post.type === "link" && post.url !== "" && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm text-[#0079D3] hover:underline dark:text-[#4db8ff]"
                  >
                    <ExternalLink size={14} />
                    {post.url}
                  </a>
                )}

                {post.type === "image" && post.imageUrl !== "" && (
                  <div className="mt-3">
                    <img src={post.imageUrl} alt={post.title} className="max-w-full rounded-lg" />
                  </div>
                )}
              </>
            )}

            {/* Action bar */}
            {!editing && (
              <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3 dark:border-gray-700">
                <span className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <MessageSquare size={16} />
                  {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
                </span>

                <button
                  onClick={handleShare}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <Share2 size={16} />
                  Share
                </button>

                {currentUser && (
                  <>
                    <button
                      onClick={handleSaveToggle}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      {isSaved ? (
                        <BookmarkCheck size={16} className="text-[#ff4500]" />
                      ) : (
                        <Bookmark size={16} />
                      )}
                      {isSaved ? "Saved" : "Save"}
                    </button>

                    <button
                      onClick={() => setAwardModalOpen(true)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <Award size={16} />
                      Award
                    </button>

                    <button
                      onClick={() => setCrosspostModalOpen(true)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <Repeat2 size={16} />
                      Crosspost
                    </button>

                    {!isOwnPost && (
                      <button
                        onClick={handleReport}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                      >
                        <Flag size={16} />
                        Report
                      </button>
                    )}

                    {isOwnPost && (
                      <>
                        <button
                          onClick={handleEdit}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          <Pencil size={16} />
                          Edit
                        </button>
                        <button
                          onClick={handleDelete}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comment section */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        {/* Add a comment */}
        {currentUser ? (
          <form onSubmit={handleCommentSubmit} className="mb-6">
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Comment as{" "}
              <Link
                to={`/u/${currentUser.username}`}
                className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
              >
                {currentUser.username}
              </Link>
            </p>
            <textarea
              value={commentText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setCommentText(e.target.value)
              }
              placeholder="What are your thoughts?"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              rows={4}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={commentText.trim() === ""}
                className="rounded-full bg-[#ff4500] px-6 py-1.5 text-sm font-bold text-white hover:bg-[#e03d00] disabled:opacity-50 disabled:hover:bg-[#ff4500]"
              >
                Comment
              </button>
            </div>
          </form>
        ) : (
          <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-center dark:border-gray-600 dark:bg-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <Link
                to="/login"
                className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
              >
                Log in
              </Link>{" "}
              or{" "}
              <Link
                to="/signup"
                className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
              >
                sign up
              </Link>{" "}
              to leave a comment.
            </p>
          </div>
        )}

        {/* Comment sort selector */}
        <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sort by:</span>
          <div className="relative">
            <label className="sr-only" htmlFor="comment-sort">
              Comment sort
            </label>
            <select
              id="comment-sort"
              value={commentSort}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const val = e.target.value as CommentSort;
                setCommentSort(val);
              }}
              className="appearance-none rounded border border-gray-300 bg-white py-1 pr-7 pl-2 text-xs font-medium text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {COMMENT_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        {/* Comment tree */}
        <CommentTree postId={post.id} sort={commentSort} />
      </div>

      {/* Award modal */}
      <AwardModal
        open={awardModalOpen}
        onClose={() => setAwardModalOpen(false)}
        targetType="post"
        targetId={post.id}
      />

      {/* Crosspost modal */}
      <Modal
        open={crosspostModalOpen}
        onClose={() => {
          setCrosspostModalOpen(false);
          setCrosspostSubredditId("");
        }}
        title="Crosspost to..."
      >
        {availableSubreddits.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You haven&apos;t joined any other communities to crosspost to.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="crosspost-sub"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Select a community
              </label>
              <select
                id="crosspost-sub"
                value={crosspostSubredditId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setCrosspostSubredditId(e.target.value)
                }
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Choose a subreddit...</option>
                {availableSubreddits.map((s) => (
                  <option key={s.id} value={s.id}>
                    r/{s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCrosspostModalOpen(false);
                  setCrosspostSubredditId("");
                }}
                className="rounded px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCrosspost}
                disabled={crosspostSubredditId === ""}
                className="rounded bg-[#0079D3] px-4 py-2 text-sm font-bold text-white hover:bg-[#006cbd] disabled:opacity-50"
              >
                Crosspost
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
