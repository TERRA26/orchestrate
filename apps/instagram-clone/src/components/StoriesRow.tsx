import Avatar from "./Avatar";
import { useStoriesStore } from "../store/storiesStore";
import { useUserStore } from "../store/userStore";
import { FOLLOWING_IDS } from "../seed";

export default function StoriesRow() {
  const stories = useStoriesStore((s) => s.stories);
  const openStory = useStoriesStore((s) => s.openStory);
  const getUserById = useUserStore((s) => s.getUserById);

  // Show stories from followed users only
  const trayStories = stories.filter((s) => FOLLOWING_IDS.includes(s.userId));

  return (
    <div className="bg-white border border-gray-200 rounded-md mb-4 mx-auto max-w-[470px]">
      <div className="flex gap-4 px-4 py-3 overflow-x-auto hide-scrollbar">
        {trayStories.map((story) => {
          const user = getUserById(story.userId);
          if (!user) return null;
          return (
            <button
              key={story.id}
              onClick={() => openStory(story.id)}
              className="flex flex-col items-center gap-1 flex-shrink-0 bg-transparent border-0 cursor-pointer p-0"
            >
              <Avatar
                src={user.avatarUrl}
                alt={user.username}
                size={56}
                hasStory
                storyViewed={story.viewed}
              />
              <span className="text-xs text-[#262626] max-w-[64px] truncate">
                {user.username}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
