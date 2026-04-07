import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import SubredditPage from "./pages/SubredditPage";
import PostDetail from "./pages/PostDetail";
import UserProfile from "./pages/UserProfile";
import Auth from "./pages/Auth";
import CreatePost from "./pages/CreatePost";
import CreateSubreddit from "./pages/CreateSubreddit";
import Inbox from "./pages/Inbox";
import SearchPage from "./pages/SearchPage";
import ModQueue from "./pages/ModQueue";
import { useCurrentUser } from "./store";

function SavedRedirect() {
  const currentUser = useCurrentUser();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={`/u/${currentUser.username}?tab=saved`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/popular" element={<Home />} />
        <Route path="/r/:subredditName" element={<SubredditPage />} />
        <Route path="/r/:subredditName/post/:postId" element={<PostDetail />} />
        <Route path="/r/:subredditName/mod" element={<ModQueue />} />
        <Route path="/u/:username" element={<UserProfile />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/signup" element={<Auth />} />
        <Route path="/submit" element={<CreatePost />} />
        <Route path="/create-community" element={<CreateSubreddit />} />
        <Route path="/messages" element={<Inbox />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/saved" element={<SavedRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
