import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { LogIn, UserPlus } from "lucide-react";
import { useStore, useCurrentUser } from "~/store";
import type { User } from "~/types";
import { useToast } from "~/components/ui";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export default function Auth() {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isLogin = location.pathname === "/login";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      navigate("/", { replace: true });
    }
  }, [currentUser, navigate]);

  // Clear errors when switching mode
  useEffect(() => {
    setErrors({});
    setUsername("");
    setPassword("");
    setConfirmPassword("");
  }, [isLogin]);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (username.trim() === "") {
      newErrors.username = "Username is required";
    }
    if (password === "") {
      newErrors.password = "Password is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const user = state.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password,
    );

    if (!user) {
      setErrors({ general: "Invalid username or password" });
      return;
    }

    dispatch({ type: "LOGIN", userId: user.id });
    toast.success(`Welcome back, ${user.username}!`);
    navigate("/", { replace: true });
  };

  const handleSignup = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    const trimmedUsername = username.trim();

    if (!USERNAME_REGEX.test(trimmedUsername)) {
      newErrors.username = "Username must be 3-20 characters, alphanumeric and underscores only";
    } else {
      const usernameTaken = state.users.some(
        (u) => u.username.toLowerCase() === trimmedUsername.toLowerCase(),
      );
      if (usernameTaken) {
        newErrors.username = "Username is already taken";
      }
    }

    if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      username: trimmedUsername,
      password,
      createdAt: Date.now(),
      avatar: "\u{1F600}",
      bio: "",
      savedPosts: [],
      savedComments: [],
      upvotedPosts: [],
      downvotedPosts: [],
      upvotedComments: [],
      downvotedComments: [],
      following: [],
      blocked: [],
      history: [],
    };

    dispatch({ type: "SIGNUP", user: newUser });
    dispatch({ type: "LOGIN", userId: newUser.id });
    toast.success(`Welcome to Reddat, ${newUser.username}!`);
    navigate("/", { replace: true });
  };

  if (currentUser) {
    return null;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-[400px] rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff4500]/10">
            {isLogin ? (
              <LogIn size={24} className="text-[#ff4500]" />
            ) : (
              <UserPlus size={24} className="text-[#ff4500]" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {isLogin ? "Log In" : "Sign Up"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLogin ? "Welcome back to Reddat" : "Create your Reddat account"}
          </p>
        </div>

        {/* General error */}
        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {errors.general}
          </div>
        )}

        {/* Form */}
        <form onSubmit={isLogin ? handleLogin : handleSignup}>
          <div className="flex flex-col gap-4">
            {/* Username */}
            <div>
              <label
                htmlFor="auth-username"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setUsername(e.target.value);
                  setErrors((prev) => {
                    const { username: _u, general: _g, ...rest } = prev;
                    return rest;
                  });
                }}
                placeholder="Enter your username"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:outline-none dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 ${
                  errors.username
                    ? "border-red-400 focus:ring-red-300 dark:border-red-500"
                    : "border-gray-300 focus:border-[#ff4500] focus:ring-[#ff4500]/30 dark:border-gray-600"
                }`}
                autoComplete="username"
              />
              {errors.username && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="auth-password"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setPassword(e.target.value);
                  setErrors((prev) => {
                    const { password: _p, general: _g, ...rest } = prev;
                    return rest;
                  });
                }}
                placeholder="Enter your password"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:outline-none dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 ${
                  errors.password
                    ? "border-red-400 focus:ring-red-300 dark:border-red-500"
                    : "border-gray-300 focus:border-[#ff4500] focus:ring-[#ff4500]/30 dark:border-gray-600"
                }`}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password (signup only) */}
            {!isLogin && (
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Confirm Password
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setConfirmPassword(e.target.value);
                    setErrors((prev) => {
                      const { confirmPassword: _c, ...rest } = prev;
                      return rest;
                    });
                  }}
                  placeholder="Confirm your password"
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:outline-none dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 ${
                    errors.confirmPassword
                      ? "border-red-400 focus:ring-red-300 dark:border-red-500"
                      : "border-gray-300 focus:border-[#ff4500] focus:ring-[#ff4500]/30 dark:border-gray-600"
                  }`}
                  autoComplete="new-password"
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full rounded-full bg-[#ff4500] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#e03d00]"
            >
              {isLogin ? "Log In" : "Sign Up"}
            </button>
          </div>
        </form>

        {/* Toggle link */}
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {isLogin ? (
            <>
              New to Reddat?{" "}
              <Link
                to="/signup"
                className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-[#0079D3] hover:underline dark:text-[#4db8ff]"
              >
                Log In
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
