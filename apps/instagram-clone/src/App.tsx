import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import StoryModal from "./components/StoryModal";
import FeedPage from "./pages/FeedPage";
import ExplorePage from "./pages/ExplorePage";
import ProfilePage from "./pages/ProfilePage";
import { useStoriesStore } from "./store/storiesStore";

export default function App() {
  const activeStoryId = useStoriesStore((s) => s.activeStoryId);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#fafafa]">
        <NavBar />
        {/* Offset for desktop sidebar and mobile bars */}
        <div className="md:ml-[244px] pt-[60px] pb-16 md:pt-0 md:pb-0">
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      {activeStoryId !== null && <StoryModal />}
    </BrowserRouter>
  );
}
