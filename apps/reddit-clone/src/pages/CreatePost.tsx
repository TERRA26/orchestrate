import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { FileText, LinkIcon, ImageIcon, ChevronDown, Search, X } from "lucide-react";
import type { Post } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { useToast } from "~/components/ui";

type PostType = "text" | "link" | "image";

const POST_TYPE_TABS: { type: PostType; label: string; icon: typeof FileText }[] = [
  { type: "text", label: "Text", icon: FileText },
  { type: "link", label: "Link", icon: LinkIcon },
  { type: "image", label: "Image", icon: ImageIcon },
];

function isValidUrl(str: string): boolean {
  try {
    const _parsed = new URL(str);
    return _parsed.href.length > 0;
  } catch {
    return false;
  }
}

export default function CreatePost() {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const prefilledSubredditName = searchParams.get("subreddit") ?? "";

  const [selectedSubredditId, setSelectedSubredditId] = useState("");
  const [subredditSearch, setSubredditSearch] = useState("");
  const [subredditDropdownOpen, setSubredditDropdownOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedFlair, setSelectedFlair] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [nsfw, setNsfw] = useState(false);
  const [urlError, setUrlError] = useState("");

  // Pre-fill subreddit from query param
  useEffect(() => {
    if (prefilledSubredditName !== "") {
      const sub = state.subreddits.find(
        (s) => s.name.toLowerCase() === prefilledSubredditName.toLowerCase(),
      );
      if (sub) {
        setSelectedSubredditId(sub.id);
        setSubredditSearch(sub.name);
      }
    }
  }, [prefilledSubredditName, state.subreddits]);

  const selectedSubreddit =
    selectedSubredditId !== ""
      ? state.subreddits.find((s) => s.id === selectedSubredditId)
      : undefined;

  const filteredSubreddits = useMemo(() => {
    const query = subredditSearch.toLowerCase().trim();
    if (query === "") return state.subreddits;
    return state.subreddits.filter((s) => s.name.toLowerCase().includes(query));
  }, [state.subreddits, subredditSearch]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value.trim() !== "" && !isValidUrl(value.trim())) {
      setUrlError("Please enter a valid URL (e.g., https://example.com)");
    } else {
      setUrlError("");
    }
  };

  const handleImageUrlChange = (value: string) => {
    setImageUrl(value);
  };

  const canSubmit = (): boolean => {
    if (selectedSubredditId === "") return false;
    if (title.trim() === "") return false;
    if (postType === "link" && (url.trim() === "" || !isValidUrl(url.trim()))) return false;
    if (postType === "image" && imageUrl.trim() === "") return false;
    return true;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit()) return;

    const newPost: Post = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: postType,
      title: title.trim(),
      body: postType === "text" ? body.trim() : "",
      url: postType === "link" ? url.trim() : "",
      imageUrl: postType === "image" ? imageUrl.trim() : "",
      subredditId: selectedSubredditId,
      authorId: currentUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      upvotes: 1,
      downvotes: 0,
      flair: selectedFlair,
      spoiler,
      nsfw,
      awards: [],
      crosspostedFrom: "",
      reported: false,
      reportReasons: [],
      removed: false,
    };

    dispatch({ type: "CREATE_POST", post: newPost });
    toast.success("Post created!");

    const subName = selectedSubreddit?.name ?? "";
    navigate(`/r/${subName}/post/${newPost.id}`);
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="mx-auto max-w-[600px] px-4 py-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">Create a Post</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Subreddit selector */}
        <div className="relative">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Community
          </label>
          <div className="relative">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={subredditSearch}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSubredditSearch(e.target.value);
                setSubredditDropdownOpen(true);
                if (e.target.value.trim() === "") {
                  setSelectedSubredditId("");
                  setSelectedFlair("");
                }
              }}
              onFocus={() => setSubredditDropdownOpen(true)}
              placeholder="Search communities..."
              className="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {selectedSubredditId !== "" && (
              <button
                type="button"
                onClick={() => {
                  setSelectedSubredditId("");
                  setSubredditSearch("");
                  setSelectedFlair("");
                }}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear selection"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {subredditDropdownOpen && selectedSubredditId === "" && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700">
              {filteredSubreddits.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No communities found
                </div>
              ) : (
                filteredSubreddits.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSelectedSubredditId(sub.id);
                      setSubredditSearch(sub.name);
                      setSubredditDropdownOpen(false);
                      setSelectedFlair("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-600"
                  >
                    <span className="text-lg">{sub.icon || "🌐"}</span>
                    <div>
                      <span className="font-medium">r/{sub.name}</span>
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        {sub.members.length} members
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Post type tabs */}
        <div className="flex rounded-md border border-gray-200 dark:border-gray-700">
          {POST_TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() => setPostType(tab.type)}
                className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
                  postType === tab.type
                    ? "border-[#0079D3] bg-white text-[#0079D3] dark:bg-gray-800 dark:text-[#4db8ff]"
                    : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Title */}
        <div>
          <label
            htmlFor="post-title"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="post-title"
            type="text"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            placeholder="An interesting title"
            maxLength={300}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <p className="mt-1 text-right text-xs text-gray-400">{title.length}/300</p>
        </div>

        {/* Body (text posts) */}
        {postType === "text" && (
          <div>
            <label
              htmlFor="post-body"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Body <span className="text-xs text-gray-400">(supports markdown)</span>
            </label>
            <textarea
              id="post-body"
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder="Text (optional)"
              rows={8}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        )}

        {/* URL (link posts) */}
        {postType === "link" && (
          <div>
            <label
              htmlFor="post-url"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              URL <span className="text-red-500">*</span>
            </label>
            <input
              id="post-url"
              type="text"
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUrlChange(e.target.value)}
              placeholder="https://example.com"
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:outline-none dark:bg-gray-700 dark:text-gray-100 ${
                urlError !== ""
                  ? "border-red-400 focus:border-red-400 focus:ring-red-400"
                  : "border-gray-300 focus:border-blue-400 focus:ring-blue-400 dark:border-gray-600"
              }`}
            />
            {urlError !== "" && <p className="mt-1 text-xs text-red-500">{urlError}</p>}
          </div>
        )}

        {/* Image URL (image posts) */}
        {postType === "image" && (
          <div>
            <label
              htmlFor="post-image-url"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Image URL <span className="text-red-500">*</span>
            </label>
            <input
              id="post-image-url"
              type="text"
              value={imageUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleImageUrlChange(e.target.value)
              }
              placeholder="https://example.com/image.jpg"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {imageUrl.trim() !== "" && isValidUrl(imageUrl.trim()) && (
              <div className="mt-3 rounded-md border border-gray-200 p-2 dark:border-gray-600">
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Preview:</p>
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="max-h-48 rounded object-contain"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Flair selector */}
        {selectedSubreddit && selectedSubreddit.flairs.length > 0 && (
          <div>
            <label
              htmlFor="post-flair"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Flair
            </label>
            <div className="relative">
              <select
                id="post-flair"
                value={selectedFlair}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSelectedFlair(e.target.value)
                }
                className="w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pr-8 pl-3 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">None</option>
                {selectedSubreddit.flairs.map((flair) => (
                  <option key={flair} value={flair}>
                    {flair}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>
        )}

        {/* Spoiler & NSFW toggles */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={spoiler}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpoiler(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#ff4500] focus:ring-[#ff4500] dark:border-gray-600"
            />
            Spoiler
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNsfw(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-500 dark:border-gray-600"
            />
            NSFW
          </label>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-full border border-gray-300 px-6 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit()}
            className="rounded-full bg-[#0079D3] px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-[#006cbd] disabled:opacity-50 disabled:hover:bg-[#0079D3]"
          >
            Post
          </button>
        </div>
      </form>
    </div>
  );
}
