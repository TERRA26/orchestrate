import { useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useStoriesStore } from "../store/storiesStore";
import { useUserStore } from "../store/userStore";

const STORY_DURATION = 5000;

export default function StoryModal() {
  const stories = useStoriesStore((s) => s.stories);
  const activeStoryId = useStoriesStore((s) => s.activeStoryId);
  const closeStory = useStoriesStore((s) => s.closeStory);
  const nextStory = useStoriesStore((s) => s.nextStory);
  const prevStory = useStoriesStore((s) => s.prevStory);
  const getUserById = useUserStore((s) => s.getUserById);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const story = stories.find((s) => s.id === activeStoryId);
  const user = story ? getUserById(story.userId) : null;
  const currentIndex = stories.findIndex((s) => s.id === activeStoryId);

  useEffect(() => {
    if (!activeStoryId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      nextStory(activeStoryId);
    }, STORY_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeStoryId, nextStory]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStory();
      if (e.key === "ArrowRight" && activeStoryId) nextStory(activeStoryId);
      if (e.key === "ArrowLeft" && activeStoryId) prevStory(activeStoryId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeStoryId, closeStory, nextStory, prevStory]);

  if (!story || !user) return null;

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onClick={closeStory}
    >
      <div
        className="relative w-full max-w-sm h-full max-h-[90vh] md:max-h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
          {stories.map((s, idx) => (
            <div key={s.id} className="flex-1 h-[2px] bg-white/40 rounded-full overflow-hidden">
              {idx < currentIndex ? (
                <div className="h-full w-full bg-white" />
              ) : idx === currentIndex ? (
                <div
                  key={activeStoryId}
                  className="h-full bg-white story-progress-active"
                  style={{ animationDuration: `${STORY_DURATION}ms` }}
                />
              ) : null}
            </div>
          ))}
        </div>

        {/* User header */}
        <div className="absolute top-8 left-3 right-3 flex items-center gap-2 z-10">
          <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover border-2 border-white" />
          <span className="text-white text-sm font-semibold">{user.username}</span>
          <span className="text-white/70 text-xs">{story.timestamp}</span>
        </div>

        {/* Close button */}
        <button
          onClick={closeStory}
          className="absolute top-8 right-3 z-10 bg-transparent border-0 cursor-pointer text-white"
        >
          <X size={24} />
        </button>

        {/* Story image */}
        <img
          src={story.imageUrl}
          alt="Story"
          className="w-full h-full object-cover"
        />

        {/* Navigation zones */}
        <button
          onClick={() => prevStory(story.id)}
          className="absolute left-0 top-0 w-1/3 h-full bg-transparent border-0 cursor-pointer flex items-center justify-start pl-2"
          aria-label="Previous story"
        >
          {currentIndex > 0 && <ChevronLeft size={28} className="text-white opacity-70" />}
        </button>
        <button
          onClick={() => nextStory(story.id)}
          className="absolute right-0 top-0 w-1/3 h-full bg-transparent border-0 cursor-pointer flex items-center justify-end pr-2"
          aria-label="Next story"
        >
          <ChevronRight size={28} className="text-white opacity-70" />
        </button>
      </div>
    </div>
  );
}
