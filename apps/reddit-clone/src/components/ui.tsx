import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useStore, useCurrentUser } from "~/store";
import { renderMarkdown } from "~/utils";

// ---------------------------------------------------------------------------
// Toast System
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: Toast["type"]) => {
      const id = `toast-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        removeToast(id);
      }, 3000);
    },
    [removeToast],
  );

  const api = useMemo<ToastAPI>(
    () => ({
      success: (msg: string) => addToast(msg, "success"),
      error: (msg: string) => addToast(msg, "error"),
      info: (msg: string) => addToast(msg, "info"),
    }),
    [addToast],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div className="fixed right-4 bottom-4 z-[9999] flex flex-col gap-2">
        {toasts.map((toast) => {
          const bgClass =
            toast.type === "success"
              ? "bg-green-500"
              : toast.type === "error"
                ? "bg-red-500"
                : "bg-blue-500";
          return (
            <div
              key={toast.id}
              className={`${bgClass} flex min-w-[280px] items-center justify-between rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg`}
            >
              <span>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-3 rounded p-0.5 hover:bg-white/20"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Loading Skeletons
// ---------------------------------------------------------------------------

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

export function PostSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
        >
          {/* vote column */}
          <div className="flex flex-col items-center gap-2">
            <SkeletonBar className="h-4 w-4" />
            <SkeletonBar className="h-4 w-6" />
            <SkeletonBar className="h-4 w-4" />
          </div>
          {/* content */}
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonBar className="h-3 w-40" />
            <SkeletonBar className="h-5 w-3/4" />
            <SkeletonBar className="h-16 w-full" />
            <div className="flex gap-4">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-3 w-16" />
              <SkeletonBar className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2" style={{ paddingLeft: `${(i % 3) * 24}px` }}>
          <div className="flex items-center gap-2">
            <SkeletonBar className="h-3 w-20" />
            <SkeletonBar className="h-3 w-12" />
          </div>
          <SkeletonBar className="h-10 w-full" />
          <div className="flex gap-3">
            <SkeletonBar className="h-3 w-10" />
            <SkeletonBar className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50"
    >
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Award Modal
// ---------------------------------------------------------------------------

const AWARD_OPTIONS: {
  type: "free" | "silver" | "gold" | "platinum";
  icon: string;
  label: string;
}[] = [
  { type: "free", icon: "\uD83C\uDF81", label: "Free Award" },
  { type: "silver", icon: "\uD83E\uDD48", label: "Silver" },
  { type: "gold", icon: "\uD83E\uDD47", label: "Gold" },
  { type: "platinum", icon: "\uD83D\uDC8E", label: "Platinum" },
];

export function AwardModal({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: "post" | "comment";
  targetId: string;
}) {
  const { dispatch } = useStore();
  const currentUser = useCurrentUser();

  const handleGiveAward = (awardType: "free" | "silver" | "gold" | "platinum") => {
    if (!currentUser) return;
    const award = {
      type: awardType,
      givenBy: currentUser.id,
      givenAt: Date.now(),
    } as const;

    if (targetType === "post") {
      dispatch({ type: "GIVE_AWARD_POST", postId: targetId, award });
    } else {
      dispatch({ type: "GIVE_AWARD_COMMENT", commentId: targetId, award });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Give Award">
      {!currentUser ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You must be logged in to give awards.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {AWARD_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleGiveAward(opt.type)}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 transition-colors hover:border-orange-400 hover:bg-orange-50 dark:border-gray-600 dark:hover:border-orange-500 dark:hover:bg-orange-900/20"
            >
              <span className="text-3xl">{opt.icon}</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function Markdown({ content }: { content: string }) {
  const html = renderMarkdown(content);
  return (
    <div
      className="prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
