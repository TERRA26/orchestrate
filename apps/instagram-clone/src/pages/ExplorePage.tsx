import { useState } from "react";
import PostModal from "../components/PostModal";
import { useFeedStore } from "../store/feedStore";
import type { Post } from "../types";

export default function ExplorePage() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const posts = useFeedStore((s) => s.posts);

  // Show all posts in explore (shuffled look by reversing)
  const explorePosts = [...posts].reverse();

  return (
    <>
      <div className="pt-16 md:pt-4 pb-20 md:pb-8 px-1 max-w-[935px] mx-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          {explorePosts.map((post, idx) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="bg-transparent border-0 cursor-pointer p-0 overflow-hidden"
              style={{ aspectRatio: idx % 7 === 0 ? "1 / 1.5" : "1 / 1", gridRow: idx % 7 === 0 ? "span 2" : "span 1" }}
            >
              <img
                src={post.imageUrl}
                alt="Explore post"
                className="w-full h-full object-cover hover:opacity-80 transition-opacity"
              />
            </button>
          ))}
        </div>
      </div>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </>
  );
}
