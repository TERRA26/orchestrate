import { useState, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import Avatar from "./Avatar";
import ActionBar from "./ActionBar";
import { useFeedStore } from "../store/feedStore";
import { useUserStore } from "../store/userStore";
import type { Post } from "../types";

interface PostCardProps {
  post: Post;
  onOpenComments?: () => void;
}

export default function PostCard({ post, onOpenComments }: PostCardProps) {
  const [showHeart, setShowHeart] = useState(false);
  const lastTapRef = useRef(0);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const getUserById = useUserStore((s) => s.getUserById);
  const user = getUserById(post.userId);

  if (!user) return null;

  const handleImageClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      if (!post.liked) toggleLike(post.id);
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 900);
    }
    lastTapRef.current = now;
  };

  const formatLikes = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : n.toString();

  return (
    <article className="bg-white border border-gray-200 rounded-md mb-4 mx-auto max-w-[470px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <Link to={`/profile/${user.username}`} className="flex items-center gap-3 no-underline">
          <Avatar src={user.avatarUrl} alt={user.username} size={32} hasStory={user.hasStory} storyViewed={user.storyViewed} />
          <div>
            <p className="text-sm font-semibold text-[#262626] m-0">{user.username}</p>
            {post.location && <p className="text-xs text-[#737373] m-0">{post.location}</p>}
          </div>
        </Link>
        <button className="bg-transparent border-0 cursor-pointer p-1">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image */}
      <div className="relative select-none" onClick={handleImageClick}>
        <img
          src={post.imageUrl}
          alt="Post"
          className="w-full block object-cover"
          style={{ maxHeight: 585 }}
          draggable={false}
        />
        {showHeart && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              className="heart-burst"
              width="100"
              height="100"
              viewBox="0 0 24 24"
              fill="white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
            </svg>
          </div>
        )}
      </div>

      {/* Actions */}
      <ActionBar
        liked={post.liked}
        saved={post.saved}
        onLike={() => toggleLike(post.id)}
        onSave={() => toggleSave(post.id)}
        onComment={onOpenComments}
      />

      {/* Likes */}
      <div className="px-3 pb-1">
        <p className="text-sm font-semibold m-0">{formatLikes(post.likes)} likes</p>
      </div>

      {/* Caption */}
      <div className="px-3 pb-1">
        <p className="text-sm m-0">
          <Link to={`/profile/${user.username}`} className="font-semibold text-[#262626] no-underline mr-1">
            {user.username}
          </Link>
          {post.caption}
        </p>
      </div>

      {/* Comments preview */}
      {post.comments.length > 0 && (
        <div className="px-3 pb-1">
          <button
            onClick={onOpenComments}
            className="text-sm text-[#737373] bg-transparent border-0 cursor-pointer p-0"
          >
            View all {post.comments.length} comment{post.comments.length > 1 ? "s" : ""}
          </button>
          {post.comments.slice(0, 2).map((comment) => {
            const commentUser = getUserById(comment.userId);
            return (
              <p key={comment.id} className="text-sm m-0">
                <span className="font-semibold">{commentUser?.username ?? "user"}</span>{" "}
                {comment.text}
              </p>
            );
          })}
        </div>
      )}

      {/* Timestamp */}
      <div className="px-3 pb-3 pt-1">
        <p className="text-xs text-[#737373] uppercase m-0">{post.timestamp}</p>
      </div>
    </article>
  );
}
