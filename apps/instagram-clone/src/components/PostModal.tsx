import { useEffect } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import ActionBar from "./ActionBar";
import { useFeedStore } from "../store/feedStore";
import { useUserStore } from "../store/userStore";
import type { Post } from "../types";

interface PostModalProps {
  post: Post;
  onClose: () => void;
}

export default function PostModal({ post, onClose }: PostModalProps) {
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const postFromStore = useFeedStore((s) => s.getPostById(post.id)) ?? post;
  const getUserById = useUserStore((s) => s.getUserById);
  const user = getUserById(post.userId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!user) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg overflow-hidden flex w-full max-w-4xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image side */}
        <div className="flex-1 bg-black flex items-center justify-center min-w-0">
          <img src={post.imageUrl} alt="Post" className="max-h-[90vh] w-full object-contain" />
        </div>

        {/* Info side */}
        <div className="w-[340px] flex-shrink-0 flex flex-col border-l border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <Link to={`/profile/${user.username}`} className="flex items-center gap-3 no-underline" onClick={onClose}>
              <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover" />
              <span className="text-sm font-semibold text-[#262626]">{user.username}</span>
            </Link>
            <button onClick={onClose} className="bg-transparent border-0 cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Caption */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-3">
              <p className="text-sm m-0">
                <span className="font-semibold">{user.username}</span> {post.caption}
              </p>
              <p className="text-xs text-[#737373] mt-1 m-0">{post.timestamp}</p>
            </div>
            {/* Comments */}
            {postFromStore.comments.map((comment) => {
              const cu = getUserById(comment.userId);
              return (
                <div key={comment.id} className="mb-2">
                  <p className="text-sm m-0">
                    <span className="font-semibold">{cu?.username ?? "user"}</span>{" "}
                    {comment.text}
                  </p>
                  <p className="text-xs text-[#737373] m-0">{comment.timestamp}</p>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200">
            <ActionBar
              liked={postFromStore.liked}
              saved={postFromStore.saved}
              onLike={() => toggleLike(post.id)}
              onSave={() => toggleSave(post.id)}
            />
            <div className="px-4 pb-2">
              <p className="text-sm font-semibold m-0">{postFromStore.likes.toLocaleString()} likes</p>
              <p className="text-xs text-[#737373] uppercase mt-1 m-0">{post.timestamp}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
