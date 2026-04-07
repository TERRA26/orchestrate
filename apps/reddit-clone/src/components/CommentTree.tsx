import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowBigUp,
  ArrowBigDown,
  MessageSquare,
  Award,
  Flag,
  Pencil,
  Trash2,
  Minus,
  Plus,
} from "lucide-react";
import type { Comment, CommentSort } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { timeAgo } from "~/utils";
import { AwardModal, Markdown, useToast } from "~/components/ui";

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

interface CommentNode {
  comment: Comment;
  children: CommentNode[];
}

function commentControversiality(c: Comment): number {
  const total = c.upvotes + c.downvotes;
  if (total === 0) return 0;
  const ratio = Math.min(c.upvotes, c.downvotes) / Math.max(c.upvotes, c.downvotes, 1);
  return total * ratio;
}

function buildTree(comments: Comment[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const c of comments) {
    map.set(c.id, { comment: c, children: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id);
    if (!node) continue;

    if (c.parentId === "") {
      roots.push(node);
    } else {
      const parent = map.get(c.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan -- treat as top-level
        roots.push(node);
      }
    }
  }

  return roots;
}

function sortNodes(nodes: CommentNode[], sort: CommentSort): CommentNode[] {
  const sorted = [...nodes];

  switch (sort) {
    case "new":
      sorted.sort((a, b) => b.comment.createdAt - a.comment.createdAt);
      break;
    case "old":
      sorted.sort((a, b) => a.comment.createdAt - b.comment.createdAt);
      break;
    case "top":
    case "best":
      sorted.sort(
        (a, b) =>
          b.comment.upvotes - b.comment.downvotes - (a.comment.upvotes - a.comment.downvotes),
      );
      break;
    case "controversial":
      sorted.sort(
        (a, b) => commentControversiality(b.comment) - commentControversiality(a.comment),
      );
      break;
  }

  // Recursively sort children
  for (const node of sorted) {
    node.children = sortNodes(node.children, sort);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Depth colors for the left border lines
// ---------------------------------------------------------------------------

const DEPTH_COLORS = [
  "border-blue-400",
  "border-orange-400",
  "border-green-400",
  "border-purple-400",
  "border-pink-400",
  "border-yellow-400",
  "border-teal-400",
  "border-red-400",
  "border-indigo-400",
  "border-cyan-400",
] as const;

function depthColor(depth: number): string {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length] ?? DEPTH_COLORS[0];
}

// ---------------------------------------------------------------------------
// Award badges
// ---------------------------------------------------------------------------

const AWARD_ICONS: Record<string, string> = {
  free: "\uD83C\uDF81",
  silver: "\uD83E\uDD48",
  gold: "\uD83E\uDD47",
  platinum: "\uD83D\uDC8E",
};

function AwardBadges({ awards }: { awards: Comment["awards"] }) {
  if (awards.length === 0) return null;

  const counts = new Map<string, number>();
  for (const a of awards) {
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {Array.from(counts.entries()).map(([type, count]) => (
        <span key={type} className="flex items-center gap-0.5" title={type}>
          {AWARD_ICONS[type] ?? ""}{" "}
          {count > 1 && <span className="text-gray-500 dark:text-gray-400">{count}</span>}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single comment node
// ---------------------------------------------------------------------------

function CommentNodeView({ node, depth }: { node: CommentNode; depth: number }) {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const toast = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.comment.body);
  const [awardModalOpen, setAwardModalOpen] = useState(false);

  const { comment } = node;
  const author = state.users.find((u) => u.id === comment.authorId);
  const authorName = author?.username ?? "[deleted]";
  const isOwn = currentUser?.id === comment.authorId;
  const score = comment.upvotes - comment.downvotes;
  const hasUpvoted = currentUser?.upvotedComments.includes(comment.id) ?? false;
  const hasDownvoted = currentUser?.downvotedComments.includes(comment.id) ?? false;

  const handleVote = (direction: "up" | "down") => {
    if (!currentUser) return;
    let voteDirection: "up" | "down" | "none";
    if (direction === "up") {
      voteDirection = hasUpvoted ? "none" : "up";
    } else {
      voteDirection = hasDownvoted ? "none" : "down";
    }
    dispatch({
      type: "VOTE_COMMENT",
      commentId: comment.id,
      userId: currentUser.id,
      direction: voteDirection,
    });
  };

  const handleReplySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || replyText.trim() === "") return;
    const newComment: Comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      postId: comment.postId,
      parentId: comment.id,
      authorId: currentUser.id,
      body: replyText.trim(),
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
    setReplyText("");
    setReplying(false);
    toast.success("Reply posted!");
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editText.trim() === "") return;
    dispatch({
      type: "EDIT_COMMENT",
      commentId: comment.id,
      body: editText.trim(),
    });
    setEditing(false);
    toast.success("Comment updated.");
  };

  const handleDelete = () => {
    if (!window.confirm("Delete this comment?")) return;
    dispatch({ type: "DELETE_COMMENT", commentId: comment.id });
    toast.info("Comment deleted.");
  };

  const handleReport = () => {
    if (!currentUser) return;
    const reason = window.prompt("Reason for reporting this comment:");
    if (reason != null && reason.trim() !== "") {
      dispatch({
        type: "REPORT_COMMENT",
        commentId: comment.id,
        reason: reason.trim(),
      });
      toast.info("Comment reported. Thank you.");
    }
  };

  // Cap visible depth
  const maxVisibleDepth = 10;
  const isDeepThread = depth >= maxVisibleDepth;

  if (isDeepThread) {
    return (
      <div className="ml-4 mt-2">
        <Link to={`#${comment.id}`} className="text-xs font-medium text-blue-500 hover:underline">
          Continue this thread &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex">
        {/* Collapse toggle / colored left border */}
        {depth > 0 && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`mr-2 w-0 shrink-0 cursor-pointer border-l-2 hover:border-l-4 ${depthColor(depth - 1)}`}
            aria-label={collapsed ? "Expand thread" : "Collapse thread"}
          />
        )}

        <div className="min-w-0 flex-1">
          {/* Comment header */}
          <div className="flex items-center gap-2 text-xs">
            {depth === 0 && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? <Plus size={12} /> : <Minus size={12} />}
              </button>
            )}
            <Link
              to={`/u/${authorName}`}
              className="font-medium text-gray-900 hover:underline dark:text-gray-100"
            >
              {authorName}
            </Link>
            <span className="text-gray-500 dark:text-gray-400">{timeAgo(comment.createdAt)}</span>
            {comment.updatedAt !== comment.createdAt && (
              <span className="text-gray-400 italic dark:text-gray-500" title="Edited">
                (edited)
              </span>
            )}
            {comment.awards.length > 0 && <AwardBadges awards={comment.awards} />}
            {collapsed && (
              <span className="text-gray-400 dark:text-gray-500">
                ({node.children.length} {node.children.length === 1 ? "child" : "children"})
              </span>
            )}
          </div>

          {!collapsed && (
            <>
              {/* Comment body */}
              {editing ? (
                <form onSubmit={handleEditSubmit} className="mt-1">
                  <textarea
                    value={editText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setEditText(e.target.value)
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    rows={4}
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="submit"
                      className="rounded bg-[#ff4500] px-3 py-1 text-xs font-medium text-white hover:bg-[#e03d00]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setEditText(comment.body);
                      }}
                      className="rounded px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-1">
                  {comment.removed ? (
                    <p className="text-sm text-red-500 italic">[removed by moderator]</p>
                  ) : (
                    <Markdown content={comment.body} />
                  )}
                </div>
              )}

              {/* Action bar */}
              {!editing && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                  {/* Inline vote buttons - horizontal for comments */}
                  <button
                    onClick={() => handleVote("up")}
                    className={`rounded p-1 transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/30 ${
                      hasUpvoted ? "text-[#ff4500]" : "text-gray-400 dark:text-gray-500"
                    }`}
                    aria-label="Upvote"
                  >
                    <ArrowBigUp size={16} fill={hasUpvoted ? "currentColor" : "none"} />
                  </button>
                  <span
                    className={`min-w-[20px] text-center font-bold ${
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
                    <ArrowBigDown size={16} fill={hasDownvoted ? "currentColor" : "none"} />
                  </button>

                  {currentUser && (
                    <>
                      <button
                        onClick={() => setReplying(!replying)}
                        className="ml-1 flex items-center gap-1 rounded px-2 py-1 font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                      >
                        <MessageSquare size={14} />
                        Reply
                      </button>

                      <button
                        onClick={() => setAwardModalOpen(true)}
                        className="flex items-center gap-1 rounded px-2 py-1 font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                      >
                        <Award size={14} />
                        Award
                      </button>

                      {isOwn && (
                        <>
                          <button
                            onClick={() => setEditing(true)}
                            className="flex items-center gap-1 rounded px-2 py-1 font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                          <button
                            onClick={handleDelete}
                            className="flex items-center gap-1 rounded px-2 py-1 font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </>
                      )}

                      {!isOwn && (
                        <button
                          onClick={handleReport}
                          className="flex items-center gap-1 rounded px-2 py-1 font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          <Flag size={14} />
                          Report
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Reply form */}
              {replying && (
                <form onSubmit={handleReplySubmit} className="mt-2">
                  <textarea
                    value={replyText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setReplyText(e.target.value)
                    }
                    placeholder="What are your thoughts?"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    rows={3}
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="submit"
                      disabled={replyText.trim() === ""}
                      className="rounded bg-[#ff4500] px-3 py-1 text-xs font-medium text-white hover:bg-[#e03d00] disabled:opacity-50"
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplying(false);
                        setReplyText("");
                      }}
                      className="rounded px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Render children */}
              {node.children.length > 0 && (
                <div className="ml-2">
                  {node.children.map((child) => (
                    <CommentNodeView key={child.comment.id} node={child} depth={depth + 1} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AwardModal
        open={awardModalOpen}
        onClose={() => setAwardModalOpen(false)}
        targetType="comment"
        targetId={comment.id}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentTree (entry)
// ---------------------------------------------------------------------------

export default function CommentTree({ postId, sort }: { postId: string; sort: CommentSort }) {
  const { state } = useStore();

  const tree = useMemo(() => {
    const postComments = state.comments.filter((c) => c.postId === postId);
    const roots = buildTree(postComments);
    return sortNodes(roots, sort);
  }, [state.comments, postId, sort]);

  if (tree.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No comments yet. Be the first to share what you think!
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {tree.map((node) => (
        <CommentNodeView key={node.comment.id} node={node} depth={0} />
      ))}
    </div>
  );
}
