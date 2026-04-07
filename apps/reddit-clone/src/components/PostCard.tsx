import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowBigUp,
  ArrowBigDown,
  MessageSquare,
  Share2,
  Bookmark,
  BookmarkCheck,
  Award,
  Flag,
  ExternalLink,
  Repeat2,
} from "lucide-react";
import type { Post } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { timeAgo, truncate, countComments } from "~/utils";
import { AwardModal, useToast } from "~/components/ui";

// ---------------------------------------------------------------------------
// Award display helpers
// ---------------------------------------------------------------------------

const AWARD_ICONS: Record<string, string> = {
  free: "\uD83C\uDF81",
  silver: "\uD83E\uDD48",
  gold: "\uD83E\uDD47",
  platinum: "\uD83D\uDC8E",
};

function AwardBadges({ awards }: { awards: Post["awards"] }) {
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
// Vote Buttons (inline, vertical)
// ---------------------------------------------------------------------------

function VoteButtons({ post }: { post: Post }) {
  const { dispatch } = useStore();
  const currentUser = useCurrentUser();

  const score = post.upvotes - post.downvotes;
  const hasUpvoted = currentUser?.upvotedPosts.includes(post.id) ?? false;
  const hasDownvoted = currentUser?.downvotedPosts.includes(post.id) ?? false;

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

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
          handleVote("up");
        }}
        className={`rounded p-1 transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/30 ${
          hasUpvoted ? "text-[#ff4500]" : "text-gray-400 dark:text-gray-500"
        }`}
        aria-label="Upvote"
      >
        <ArrowBigUp size={22} fill={hasUpvoted ? "currentColor" : "none"} />
      </button>
      <span
        className={`text-xs font-bold ${
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
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
          handleVote("down");
        }}
        className={`rounded p-1 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30 ${
          hasDownvoted ? "text-blue-500" : "text-gray-400 dark:text-gray-500"
        }`}
        aria-label="Downvote"
      >
        <ArrowBigDown size={22} fill={hasDownvoted ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostCard
// ---------------------------------------------------------------------------

export default function PostCard({ post, showSubreddit }: { post: Post; showSubreddit: boolean }) {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const toast = useToast();
  const [awardModalOpen, setAwardModalOpen] = useState(false);

  // Resolve subreddit & author
  const subreddit = state.subreddits.find((s) => s.id === post.subredditId);
  const author = state.users.find((u) => u.id === post.authorId);
  const subredditName = subreddit?.name ?? "unknown";
  const authorName = author?.username ?? "[deleted]";

  // Comment count
  const commentCount = countComments(state.comments, post.id);

  // Saved state
  const isSaved = currentUser?.savedPosts.includes(post.id) ?? false;

  // Crosspost source
  const crosspostSource =
    post.crosspostedFrom !== ""
      ? state.posts.find((p) => p.id === post.crosspostedFrom)
      : undefined;
  const crosspostSubreddit = crosspostSource
    ? state.subreddits.find((s) => s.id === crosspostSource.subredditId)
    : undefined;

  // URL domain for link posts
  let linkDomain = "";
  if (post.type === "link" && post.url !== "") {
    try {
      linkDomain = new URL(post.url).hostname;
    } catch {
      linkDomain = post.url;
    }
  }

  const postLink = `/r/${subredditName}/post/${post.id}`;

  const handleSaveToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    if (isSaved) {
      dispatch({ type: "UNSAVE_POST", userId: currentUser.id, postId: post.id });
    } else {
      dispatch({ type: "SAVE_POST", userId: currentUser.id, postId: post.id });
    }
  };

  const handleShare = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const permalink = `${window.location.origin}${postLink}`;
    navigator.clipboard.writeText(permalink).then(
      () => toast.success("Link copied to clipboard!"),
      () => toast.error("Failed to copy link"),
    );
  };

  const handleReport = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const reason = window.prompt("Reason for reporting this post:");
    if (reason != null && reason.trim() !== "") {
      dispatch({ type: "REPORT_POST", postId: post.id, reason: reason.trim() });
      toast.info("Post reported. Thank you.");
    }
  };

  return (
    <>
      <div className="group flex rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
        {/* Vote column */}
        <div className="flex items-start rounded-l-lg bg-gray-50 px-2 py-3 dark:bg-gray-800/60">
          <VoteButtons post={post} />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2">
          {/* Meta line */}
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            {showSubreddit && (
              <>
                <Link
                  to={`/r/${subredditName}`}
                  className="font-bold text-gray-900 hover:underline dark:text-gray-100"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  r/{subredditName}
                </Link>
                <span>&middot;</span>
              </>
            )}
            <span>
              Posted by{" "}
              <Link
                to={`/u/${authorName}`}
                className="hover:underline"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                u/{authorName}
              </Link>
            </span>
            <span>&middot;</span>
            <span>{timeAgo(post.createdAt)}</span>
            {post.awards.length > 0 && (
              <>
                <span>&middot;</span>
                <AwardBadges awards={post.awards} />
              </>
            )}
          </div>

          {/* Title + badges */}
          <Link to={postLink} className="group/title">
            <h3 className="text-lg font-medium leading-snug text-gray-900 group-hover/title:text-blue-600 dark:text-gray-100 dark:group-hover/title:text-blue-400">
              {post.spoiler && (
                <span className="mr-1.5 rounded bg-gray-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  Spoiler
                </span>
              )}
              {post.nsfw && (
                <span className="mr-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  NSFW
                </span>
              )}
              {post.flair !== "" && (
                <span className="mr-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {post.flair}
                </span>
              )}
              {post.title}
            </h3>
          </Link>

          {/* Crosspost indicator */}
          {crosspostSource && crosspostSubreddit && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Repeat2 size={12} />
              <span>
                crossposted from{" "}
                <Link to={`/r/${crosspostSubreddit.name}`} className="font-medium hover:underline">
                  r/{crosspostSubreddit.name}
                </Link>
              </span>
            </div>
          )}

          {/* Content preview */}
          {post.type === "text" && post.body !== "" && (
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {truncate(post.body, 300)}
            </p>
          )}

          {post.type === "link" && post.url !== "" && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <ExternalLink size={14} />
              {linkDomain}
            </a>
          )}

          {post.type === "image" && post.imageUrl !== "" && (
            <Link to={postLink}>
              <img
                src={post.imageUrl}
                alt={post.title}
                className="mt-1 max-h-[400px] rounded-lg object-contain"
              />
            </Link>
          )}

          {/* Bottom action bar */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Link
              to={postLink}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <MessageSquare size={16} />
              {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
            </Link>

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
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.preventDefault();
                    setAwardModalOpen(true);
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <Award size={16} />
                  Award
                </button>

                <button
                  onClick={handleReport}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <Flag size={16} />
                  Report
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <AwardModal
        open={awardModalOpen}
        onClose={() => setAwardModalOpen(false)}
        targetType="post"
        targetId={post.id}
      />
    </>
  );
}
