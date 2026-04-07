import { useState, useMemo } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { Cake, Edit3, UserPlus, UserMinus, ShieldOff, ShieldAlert, Mail, Star } from "lucide-react";
import type { Comment as CommentType } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { formatCakeDay, calculateKarma, timeAgo } from "~/utils";
import PostCard from "~/components/PostCard";
import { Modal, useToast } from "~/components/ui";

type ProfileTab = "posts" | "comments" | "saved" | "upvoted" | "downvoted" | "history";

const ALL_TABS: { key: ProfileTab; label: string; ownOnly: boolean }[] = [
  { key: "posts", label: "Posts", ownOnly: false },
  { key: "comments", label: "Comments", ownOnly: false },
  { key: "saved", label: "Saved", ownOnly: true },
  { key: "upvoted", label: "Upvoted", ownOnly: true },
  { key: "downvoted", label: "Downvoted", ownOnly: true },
  { key: "history", label: "History", ownOnly: true },
];

function isValidTab(value: string): value is ProfileTab {
  return ["posts", "comments", "saved", "upvoted", "downvoted", "history"].includes(value);
}

function isCakeDayNearby(createdAt: number): boolean {
  const now = new Date();
  const signup = new Date(createdAt);
  const thisYearAnniversary = new Date(now.getFullYear(), signup.getMonth(), signup.getDate());
  const diff = Math.abs(now.getTime() - thisYearAnniversary.getTime());
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return diff <= sevenDays;
}

function CommentItem({
  comment,
  postTitle,
  subredditName,
  postId,
  authorName,
}: {
  comment: CommentType;
  postTitle: string;
  subredditName: string;
  postId: string;
  authorName: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-900 dark:text-gray-100">u/{authorName}</span>
        <span>commented on</span>
        <Link
          to={`/r/${subredditName}/post/${postId}`}
          className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
        >
          {postTitle}
        </Link>
        <span>&middot;</span>
        <Link
          to={`/r/${subredditName}`}
          className="font-bold text-gray-900 hover:underline dark:text-gray-100"
        >
          r/{subredditName}
        </Link>
        <span>&middot;</span>
        <span>{timeAgo(comment.createdAt)}</span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">{comment.body}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{comment.upvotes - comment.downvotes} points</span>
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const toast = useToast();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editAvatar, setEditAvatar] = useState("");

  // Find user by username
  const profileUser = useMemo(
    () => state.users.find((u) => u.username === username),
    [state.users, username],
  );

  const isOwnProfile =
    currentUser != null && profileUser != null && currentUser.id === profileUser.id;
  const isBlocked =
    currentUser != null && profileUser != null && currentUser.blocked.includes(profileUser.id);
  const isFollowing =
    currentUser != null && profileUser != null && currentUser.following.includes(profileUser.id);

  // Determine active tab
  const rawTab = searchParams.get("tab") ?? "posts";
  const activeTab: ProfileTab = isValidTab(rawTab) ? rawTab : "posts";

  // Visible tabs
  const visibleTabs = ALL_TABS.filter((tab) => !tab.ownOnly || isOwnProfile);

  const karma = useMemo(() => {
    if (!profileUser) return 0;
    return calculateKarma(state.posts, state.comments, profileUser.id);
  }, [state.posts, state.comments, profileUser]);

  // Posts by user
  const userPosts = useMemo(() => {
    if (!profileUser) return [];
    return state.posts.filter((p) => p.authorId === profileUser.id && !p.removed);
  }, [state.posts, profileUser]);

  // Comments by user
  const userComments = useMemo(() => {
    if (!profileUser) return [];
    return state.comments.filter((c) => c.authorId === profileUser.id && !c.removed);
  }, [state.comments, profileUser]);

  // Saved posts
  const savedPosts = useMemo(() => {
    if (!profileUser) return [];
    return state.posts.filter((p) => profileUser.savedPosts.includes(p.id) && !p.removed);
  }, [state.posts, profileUser]);

  // Saved comments
  const savedComments = useMemo(() => {
    if (!profileUser) return [];
    return state.comments.filter((c) => profileUser.savedComments.includes(c.id) && !c.removed);
  }, [state.comments, profileUser]);

  // Upvoted posts
  const upvotedPosts = useMemo(() => {
    if (!profileUser) return [];
    return state.posts.filter((p) => profileUser.upvotedPosts.includes(p.id) && !p.removed);
  }, [state.posts, profileUser]);

  // Downvoted posts
  const downvotedPosts = useMemo(() => {
    if (!profileUser) return [];
    return state.posts.filter((p) => profileUser.downvotedPosts.includes(p.id) && !p.removed);
  }, [state.posts, profileUser]);

  // History posts
  const historyPosts = useMemo(() => {
    if (!profileUser) return [];
    return state.posts.filter((p) => profileUser.history.includes(p.id) && !p.removed);
  }, [state.posts, profileUser]);

  const handleTabChange = (tab: ProfileTab) => {
    setSearchParams({ tab });
  };

  const handleFollow = () => {
    if (!currentUser || !profileUser) return;
    if (isFollowing) {
      dispatch({
        type: "UNFOLLOW_USER",
        userId: currentUser.id,
        targetId: profileUser.id,
      });
      toast.info(`Unfollowed u/${profileUser.username}`);
    } else {
      dispatch({
        type: "FOLLOW_USER",
        userId: currentUser.id,
        targetId: profileUser.id,
      });
      toast.success(`Following u/${profileUser.username}`);
    }
  };

  const handleBlock = () => {
    if (!currentUser || !profileUser) return;
    if (isBlocked) {
      dispatch({
        type: "UNBLOCK_USER",
        userId: currentUser.id,
        targetId: profileUser.id,
      });
      toast.info(`Unblocked u/${profileUser.username}`);
    } else {
      dispatch({
        type: "BLOCK_USER",
        userId: currentUser.id,
        targetId: profileUser.id,
      });
      toast.info(`Blocked u/${profileUser.username}`);
    }
  };

  const openEditModal = () => {
    if (!profileUser) return;
    setEditBio(profileUser.bio);
    setEditAvatar(profileUser.avatar);
    setEditModalOpen(true);
  };

  const handleSaveProfile = () => {
    if (!profileUser) return;
    const updatedUsers = state.users.map((u) =>
      u.id === profileUser.id ? { ...u, bio: editBio, avatar: editAvatar } : u,
    );
    dispatch({
      type: "LOAD_STATE",
      state: { ...state, users: updatedUsers },
    });
    setEditModalOpen(false);
    toast.success("Profile updated!");
  };

  const handleSendMessage = () => {
    if (!profileUser) return;
    navigate(`/messages?to=${profileUser.username}`);
  };

  // Resolve comment's parent post info
  const getCommentPostInfo = (
    comment: CommentType,
  ): { postTitle: string; subredditName: string; postId: string } => {
    const post = state.posts.find((p) => p.id === comment.postId);
    if (!post) {
      return { postTitle: "[deleted]", subredditName: "unknown", postId: comment.postId };
    }
    const sub = state.subreddits.find((s) => s.id === post.subredditId);
    return {
      postTitle: post.title,
      subredditName: sub?.name ?? "unknown",
      postId: post.id,
    };
  };

  if (!profileUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">User not found</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          The user u/{username} does not exist.
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

  // Blocked state
  if (isBlocked && !isOwnProfile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <ShieldAlert size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          You have blocked this user
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          u/{profileUser.username} is in your blocked list.
        </p>
        <button
          onClick={handleBlock}
          className="mt-4 rounded-full border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Unblock
        </button>
      </div>
    );
  }

  const showCakeDay = isCakeDayNearby(profileUser.createdAt);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Profile Header */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-100 text-4xl dark:bg-gray-700">
            {profileUser.avatar || "\u{1F636}"}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                u/{profileUser.username}
              </h1>
              {showCakeDay && (
                <span title="Cake Day!" className="text-xl">
                  {"\u{1F382}"}
                </span>
              )}
            </div>

            {profileUser.bio !== "" && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{profileUser.bio}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Star size={14} className="text-[#ff4500]" />
                {karma} karma
              </span>
              <span className="flex items-center gap-1">
                <Cake size={14} />
                {formatCakeDay(profileUser.createdAt)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {isOwnProfile ? (
              <button
                onClick={openEditModal}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Edit3 size={14} />
                Edit Profile
              </button>
            ) : (
              currentUser && (
                <>
                  <button
                    onClick={handleFollow}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      isFollowing
                        ? "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        : "bg-[#ff4500] text-white hover:bg-[#e03d00]"
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus size={14} />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        Follow
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleBlock}
                    className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <ShieldOff size={14} />
                    Block
                  </button>
                  <button
                    onClick={handleSendMessage}
                    className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Mail size={14} />
                    Message
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-[#ff4500] text-[#ff4500]"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex flex-col gap-3">
        {activeTab === "posts" && (
          <>
            {userPosts.length === 0 ? (
              <EmptyState message={`u/${profileUser.username} hasn't posted anything yet.`} />
            ) : (
              userPosts.map((post) => <PostCard key={post.id} post={post} showSubreddit={true} />)
            )}
          </>
        )}

        {activeTab === "comments" && (
          <>
            {userComments.length === 0 ? (
              <EmptyState message={`u/${profileUser.username} hasn't commented yet.`} />
            ) : (
              userComments.map((comment) => {
                const info = getCommentPostInfo(comment);
                return (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    postTitle={info.postTitle}
                    subredditName={info.subredditName}
                    postId={info.postId}
                    authorName={profileUser.username}
                  />
                );
              })
            )}
          </>
        )}

        {activeTab === "saved" && isOwnProfile && (
          <>
            {savedPosts.length === 0 && savedComments.length === 0 ? (
              <EmptyState message="You haven't saved anything yet." />
            ) : (
              <>
                {savedPosts.map((post) => (
                  <PostCard key={post.id} post={post} showSubreddit={true} />
                ))}
                {savedComments.map((comment) => {
                  const info = getCommentPostInfo(comment);
                  return (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      postTitle={info.postTitle}
                      subredditName={info.subredditName}
                      postId={info.postId}
                      authorName={profileUser.username}
                    />
                  );
                })}
              </>
            )}
          </>
        )}

        {activeTab === "upvoted" && isOwnProfile && (
          <>
            {upvotedPosts.length === 0 ? (
              <EmptyState message="You haven't upvoted any posts yet." />
            ) : (
              upvotedPosts.map((post) => (
                <PostCard key={post.id} post={post} showSubreddit={true} />
              ))
            )}
          </>
        )}

        {activeTab === "downvoted" && isOwnProfile && (
          <>
            {downvotedPosts.length === 0 ? (
              <EmptyState message="You haven't downvoted any posts yet." />
            ) : (
              downvotedPosts.map((post) => (
                <PostCard key={post.id} post={post} showSubreddit={true} />
              ))
            )}
          </>
        )}

        {activeTab === "history" && isOwnProfile && (
          <>
            {historyPosts.length === 0 ? (
              <EmptyState message="No browsing history yet." />
            ) : (
              historyPosts.map((post) => (
                <PostCard key={post.id} post={post} showSubreddit={true} />
              ))
            )}
          </>
        )}
      </div>

      {/* Edit Profile Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Profile">
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="edit-avatar"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Avatar (emoji)
            </label>
            <input
              id="edit-avatar"
              type="text"
              value={editAvatar}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditAvatar(e.target.value)}
              maxLength={4}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center text-2xl focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700"
            />
          </div>
          <div>
            <label
              htmlFor="edit-bio"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Bio
            </label>
            <textarea
              id="edit-bio"
              value={editBio}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditBio(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Tell us about yourself..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{editBio.length}/200</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditModalOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveProfile}
              className="rounded-full bg-[#ff4500] px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-[#e03d00]"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
