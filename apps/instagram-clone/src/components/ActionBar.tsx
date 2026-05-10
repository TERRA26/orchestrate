import { Heart, MessageCircle, Send, Bookmark } from "lucide-react";

interface ActionBarProps {
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onComment?: () => void;
}

export default function ActionBar({ liked, saved, onLike, onSave, onComment }: ActionBarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-4">
        <button
          onClick={onLike}
          className="p-0 bg-transparent border-0 cursor-pointer transition-transform active:scale-90"
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart
            size={24}
            className={liked ? "fill-red-500 stroke-red-500" : "stroke-[#262626]"}
          />
        </button>
        <button
          onClick={onComment}
          className="p-0 bg-transparent border-0 cursor-pointer"
          aria-label="Comment"
        >
          <MessageCircle size={24} className="stroke-[#262626]" />
        </button>
        <button className="p-0 bg-transparent border-0 cursor-pointer" aria-label="Share">
          <Send size={24} className="stroke-[#262626]" />
        </button>
      </div>
      <button
        onClick={onSave}
        className="p-0 bg-transparent border-0 cursor-pointer"
        aria-label={saved ? "Unsave" : "Save"}
      >
        <Bookmark
          size={24}
          className={saved ? "fill-[#262626] stroke-[#262626]" : "stroke-[#262626]"}
        />
      </button>
    </div>
  );
}
