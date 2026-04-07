import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import type { Subreddit, SubredditRule } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { randomBannerColor } from "~/utils";
import { useToast } from "~/components/ui";

const BANNER_COLORS = [
  "#FF4500",
  "#0079D3",
  "#46D160",
  "#FF6B6B",
  "#7B68EE",
  "#FF8C00",
  "#2EBFA5",
  "#EA0027",
  "#CC3600",
  "#349E48",
  "#6B5CFF",
  "#0DD3BB",
  "#FFB000",
  "#014980",
  "#94E044",
  "#FF585B",
];

const NAME_PATTERN = /^[a-zA-Z0-9_]{3,21}$/;

interface RuleDraft {
  key: string;
  title: string;
  description: string;
}

function generateKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CreateSubreddit() {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [bannerColor, setBannerColor] = useState(() => randomBannerColor());
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [flairs, setFlairs] = useState<string[]>([]);
  const [newFlair, setNewFlair] = useState("");
  const [nameError, setNameError] = useState("");

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const validateName = (value: string): string => {
    if (value.trim() === "") return "";
    if (value.length < 3) return "Name must be at least 3 characters.";
    if (value.length > 21) return "Name must be 21 characters or fewer.";
    if (!NAME_PATTERN.test(value)) return "Only letters, numbers, and underscores are allowed.";
    const exists = state.subreddits.some((s) => s.name.toLowerCase() === value.toLowerCase());
    if (exists) return "A community with this name already exists.";
    return "";
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateName(value));
  };

  const handleAddRule = () => {
    setRules((prev) => [...prev, { key: generateKey(), title: "", description: "" }]);
  };

  const handleUpdateRule = (key: string, field: "title" | "description", value: string) => {
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const handleRemoveRule = (key: string) => {
    setRules((prev) => prev.filter((r) => r.key !== key));
  };

  const handleAddFlair = () => {
    const trimmed = newFlair.trim();
    if (trimmed === "") return;
    if (flairs.includes(trimmed)) {
      toast.error("This flair already exists.");
      return;
    }
    setFlairs((prev) => [...prev, trimmed]);
    setNewFlair("");
  };

  const handleRemoveFlair = (flair: string) => {
    setFlairs((prev) => prev.filter((f) => f !== flair));
  };

  const handleFlairKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddFlair();
    }
  };

  const canSubmit = (): boolean => {
    if (name.trim() === "") return false;
    if (nameError !== "") return false;
    if (!NAME_PATTERN.test(name)) return false;
    return true;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const error = validateName(name);
    if (error !== "") {
      setNameError(error);
      return;
    }
    if (!canSubmit()) return;

    const validRules: SubredditRule[] = rules
      .filter((r) => r.title.trim() !== "")
      .map((r) => ({
        title: r.title.trim(),
        description: r.description.trim(),
      }));

    const newSubreddit: Subreddit = {
      id: `subreddit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      description: description.trim(),
      banner: bannerColor,
      icon: icon.trim() || "🌐",
      rules: validRules,
      createdAt: Date.now(),
      createdBy: currentUser.id,
      members: [currentUser.id],
      moderators: [currentUser.id],
      bannedUsers: [],
      flairs,
    };

    dispatch({ type: "CREATE_SUBREDDIT", subreddit: newSubreddit });
    toast.success(`r/${newSubreddit.name} created!`);
    navigate(`/r/${newSubreddit.name}`);
  };

  return (
    <div className="mx-auto max-w-[600px] px-4 py-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Create a Community
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Name */}
        <div>
          <label
            htmlFor="sub-name"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Name <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-0">
            <span className="rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
              r/
            </span>
            <input
              id="sub-name"
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleNameChange(e.target.value)
              }
              placeholder="community_name"
              maxLength={21}
              className={`w-full rounded-r-md border bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:outline-none dark:bg-gray-700 dark:text-gray-100 ${
                nameError !== ""
                  ? "border-red-400 focus:border-red-400 focus:ring-red-400"
                  : "border-gray-300 focus:border-blue-400 focus:ring-blue-400 dark:border-gray-600"
              }`}
            />
          </div>
          <div className="mt-1 flex items-center justify-between">
            {nameError !== "" ? (
              <p className="text-xs text-red-500">{nameError}</p>
            ) : (
              <p className="text-xs text-gray-400">
                3-21 characters. Letters, numbers, and underscores only.
              </p>
            )}
            <span className="text-xs text-gray-400">{name.length}/21</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="sub-description"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Description
          </label>
          <textarea
            id="sub-description"
            value={description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            placeholder="Tell people what your community is about"
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Icon (emoji) */}
        <div>
          <label
            htmlFor="sub-icon"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Icon (emoji)
          </label>
          <input
            id="sub-icon"
            type="text"
            value={icon}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIcon(e.target.value)}
            placeholder="🌐"
            maxLength={2}
            className="w-20 rounded-md border border-gray-300 bg-white px-3 py-2 text-center text-2xl focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700"
          />
        </div>

        {/* Banner color */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Banner Color
          </label>
          <div className="flex flex-wrap gap-2">
            {BANNER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setBannerColor(color)}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  bannerColor === color
                    ? "border-gray-900 ring-2 ring-blue-400 dark:border-white"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="custom-color" className="text-xs text-gray-500 dark:text-gray-400">
              Custom:
            </label>
            <input
              id="custom-color"
              type="text"
              value={bannerColor}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBannerColor(e.target.value)}
              placeholder="#0079D3"
              className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <div
              className="h-6 w-6 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: bannerColor }}
            />
          </div>
        </div>

        {/* Rules */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rules</label>
            <button
              type="button"
              onClick={handleAddRule}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#0079D3] hover:bg-blue-50 dark:text-[#4db8ff] dark:hover:bg-blue-900/20"
            >
              <Plus size={14} />
              Add Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No rules yet. Add rules to help guide your community.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {rules.map((rule, idx) => (
                <div
                  key={rule.key}
                  className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Rule {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(rule.key)}
                      className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      aria-label="Remove rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={rule.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleUpdateRule(rule.key, "title", e.target.value)
                    }
                    placeholder="Rule title"
                    className="mb-2 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <textarea
                    value={rule.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      handleUpdateRule(rule.key, "description", e.target.value)
                    }
                    placeholder="Rule description (optional)"
                    rows={2}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Flairs */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Flairs
          </label>

          {flairs.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {flairs.map((flair) => (
                <span
                  key={flair}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                >
                  {flair}
                  <button
                    type="button"
                    onClick={() => handleRemoveFlair(flair)}
                    className="rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800/40"
                    aria-label={`Remove flair ${flair}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newFlair}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFlair(e.target.value)}
              onKeyDown={handleFlairKeyDown}
              placeholder="Add a flair..."
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={handleAddFlair}
              disabled={newFlair.trim() === ""}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Add
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full border border-gray-300 px-6 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit()}
            className="rounded-full bg-[#0079D3] px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-[#006cbd] disabled:opacity-50 disabled:hover:bg-[#0079D3]"
          >
            Create Community
          </button>
        </div>
      </form>
    </div>
  );
}
