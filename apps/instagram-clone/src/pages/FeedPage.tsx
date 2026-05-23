import { useState } from "react";
import StoriesRow from "../components/StoriesRow";
import PostCard from "../components/PostCard";
import PostModal from "../components/PostModal";
import SuggestedUsers from "../components/SuggestedUsers";
import { useFeedStore } from "../store/feedStore";
import type { Post } from "../types";

export default function FeedPage() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const getFeedPosts = useFeedStore((s) => s.getFeedPosts);
  const feedPosts = getFeedPosts();

  return (
    <>
      <div className="flex justify-center pt-8 pb-20 md:pb-8 md:pt-4 px-4">
        {/* Feed column */}
        <div className="w-full max-w-[470px]">
          <StoriesRow />
          {feedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenComments={() => setSelectedPost(post)}
            />
          ))}
        </div>

        {/* Suggested users - desktop only at xl */}
        <div className="hidden xl:block">
          <SuggestedUsers />
        </div>
      </div>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </>
  );
}
