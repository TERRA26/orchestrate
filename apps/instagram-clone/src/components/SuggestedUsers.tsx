import { Link } from "react-router-dom";
import { useUserStore } from "../store/userStore";

export default function SuggestedUsers() {
  const users = useUserStore((s) => s.users);
  const currentUser = useUserStore((s) => s.getCurrentUser());
  const followingIds = useUserStore((s) => s.followingIds);
  const toggleFollow = useUserStore((s) => s.toggleFollow);

  const suggestions = users
    .filter((u) => u.id !== currentUser.id && !followingIds.includes(u.id))
    .slice(0, 5);

  const formatCount = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toString();

  return (
    <div className="w-[320px] flex-shrink-0 pt-8 pl-10">
      {/* Current user */}
      <div className="flex items-center gap-3 mb-5">
        <img
          src={currentUser.avatarUrl}
          alt={currentUser.username}
          className="w-11 h-11 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${currentUser.username}`} className="text-sm font-semibold text-[#262626] no-underline block truncate">
            {currentUser.username}
          </Link>
          <p className="text-sm text-[#737373] m-0 truncate">{currentUser.name}</p>
        </div>
      </div>

      {/* Suggestions */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#737373]">Suggested for you</span>
        <button className="text-xs font-semibold text-[#262626] bg-transparent border-0 cursor-pointer">
          See All
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {suggestions.map((user) => (
          <div key={user.id} className="flex items-center gap-3">
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <Link to={`/profile/${user.username}`} className="text-sm font-semibold text-[#262626] no-underline block truncate">
                {user.username}
              </Link>
              <p className="text-xs text-[#737373] m-0">{formatCount(user.followers)} followers</p>
            </div>
            <button
              onClick={() => toggleFollow(user.id)}
              className="text-xs font-semibold text-[#0095f6] bg-transparent border-0 cursor-pointer"
            >
              Follow
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
