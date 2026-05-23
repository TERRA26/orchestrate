import { useState } from "react";
import { useParams } from "react-router-dom";
import { Grid3x3, Tag } from "lucide-react";
import PostModal from "../components/PostModal";
import { useUserStore } from "../store/userStore";
import { useFeedStore } from "../store/feedStore";
import type { Post } from "../types";

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const getUserByUsername = useUserStore((s) => s.getUserByUsername);
  const currentUser = useUserStore((s) => s.getCurrentUser());
  const isFollowing = useUserStore((s) => s.isFollowing);
  const toggleFollow = useUserStore((s) => s.toggleFollow);
  const getPostsByUserId = useFeedStore((s) => s.getPostsByUserId);

  const user = getUserByUsername(username ?? "");

  if (!user) {
    return (
      <div className="pt-20 md:pt-8 text-center text-gray-500">User not found.</div>
    );
  }

  const posts = getPostsByUserId(user.id);
  const isOwnProfile = user.id === currentUser.id;
  const following = isFollowing(user.id);

  const formatCount = (n: number) =>
    n >= 1000000
      ? `${(n / 1000000).toFixed(1)}M`
      : n >= 1000
      ? `${(n / 1000).toFixed(0)}K`
      : n.toString();

  return (
    <>
      <div className="pt-16 md:pt-8 pb-20 md:pb-8 max-w-[935px] mx-auto px-4">
        {/* Profile header */}
        <div className="flex items-start gap-8 md:gap-20 mb-8">
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-[77px] md:w-[150px] h-[77px] md:h-[150px] rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-xl font-light m-0">{user.username}</h2>
              {isOwnProfile ? (
                <button className="px-4 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold">
                  Edit profile
                </button>
              ) : (
                <>
                  <button
                    onClick={() => toggleFollow(user.id)}
                    className={`px-6 py-1.5 rounded-lg text-sm font-semibold border-0 cursor-pointer ${
                      following
                        ? "bg-gray-100 text-[#262626]"
                        : "bg-[#0095f6] text-white"
                    }`}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                  <button className="px-4 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold border-0 cursor-pointer">
                    Message
                  </button>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="hidden md:flex gap-8 mb-4">
              <div className="text-sm">
                <span className="font-semibold">{posts.length}</span> posts
              </div>
              <div className="text-sm">
                <span className="font-semibold">{formatCount(user.followers)}</span> followers
              </div>
              <div className="text-sm">
                <span className="font-semibold">{formatCount(user.following)}</span> following
              </div>
            </div>

            {/* Bio */}
            <div className="hidden md:block">
              <p className="text-sm font-semibold m-0">{user.name}</p>
              <p className="text-sm m-0 whitespace-pre-line">{user.bio}</p>
            </div>
          </div>
        </div>

        {/* Mobile bio + stats */}
        <div className="md:hidden mb-4">
          <p className="text-sm font-semibold m-0">{user.name}</p>
          <p className="text-sm m-0">{user.bio}</p>
        </div>
        <div className="md:hidden flex justify-around py-3 border-t border-b border-gray-200 mb-4">
          <div className="text-center">
            <p className="font-semibold text-sm m-0">{posts.length}</p>
            <p className="text-xs text-[#737373] m-0">posts</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm m-0">{formatCount(user.followers)}</p>
            <p className="text-xs text-[#737373] m-0">followers</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm m-0">{formatCount(user.following)}</p>
            <p className="text-xs text-[#737373] m-0">following</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-gray-200 mb-4">
          <button className="flex items-center gap-1 px-4 py-3 text-xs font-semibold tracking-widest border-t-2 border-[#262626] -mt-px">
            <Grid3x3 size={12} /> POSTS
          </button>
          <button className="flex items-center gap-1 px-4 py-3 text-xs text-[#737373] font-semibold tracking-widest">
            <Tag size={12} /> TAGGED
          </button>
        </div>

        {/* Post grid */}
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="bg-transparent border-0 cursor-pointer p-0 overflow-hidden aspect-square"
            >
              <img
                src={post.imageUrl}
                alt="Post"
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
