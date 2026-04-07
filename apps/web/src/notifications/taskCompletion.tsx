// FILE: taskCompletion.tsx
// Purpose: Bridges thread completion events to in-app toasts and OS notifications.
// Layer: Notification runtime
// Exports: TaskCompletionNotifications and browser permission helpers

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toastManager } from "../components/ui/toast";
import { isElectron } from "../env";
import { useStore } from "../store";
import type { Thread } from "../types";
import {
  buildTaskCompletionCopy,
  collectCompletedThreadCandidates,
  type CompletedThreadCandidate,
} from "./taskCompletion.logic";

export type BrowserNotificationPermissionState =
  | NotificationPermission
  | "unsupported"
  | "insecure";

function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function readBrowserNotificationPermissionState(): BrowserNotificationPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  if (!window.isSecureContext) {
    return "insecure";
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  const current = readBrowserNotificationPermissionState();
  if (current === "unsupported" || current === "insecure" || current === "denied") {
    return current;
  }
  if (current === "granted") {
    return current;
  }
  return Notification.requestPermission();
}

function isWindowForeground(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

async function showSystemTaskCompletionNotification(
  candidate: CompletedThreadCandidate,
): Promise<boolean> {
  const { body, title } = buildTaskCompletionCopy(candidate);

  if (readBrowserNotificationPermissionState() !== "granted") {
    return false;
  }

  const notification = new Notification(title, {
    body,
    tag: `thread-completed:${candidate.threadId}`,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return true;
}

function showCompletionToast(
  candidate: CompletedThreadCandidate,
  navigate: ReturnType<typeof useNavigate>,
) {
  const { body, title } = buildTaskCompletionCopy(candidate);
  toastManager.add({
    type: "success",
    title,
    description: body,
    actionProps: {
      children: "Open thread",
      onClick: () => {
        void navigate({
          to: "/$threadId",
          params: { threadId: candidate.threadId },
        });
      },
    },
  });
}

export function TaskCompletionNotifications() {
  const navigate = useNavigate();
  const threads = useStore((store) => store.threads);
  const previousThreadsRef = useRef<readonly Thread[]>([]);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!readyRef.current) {
      previousThreadsRef.current = threads;
      readyRef.current = true;
      return;
    }

    const completions = collectCompletedThreadCandidates(previousThreadsRef.current, threads);
    previousThreadsRef.current = threads;

    if (completions.length === 0) {
      return;
    }

    const shouldAttemptSystemNotification = !isWindowForeground();

    for (const completion of completions) {
      showCompletionToast(completion, navigate);

      if (shouldAttemptSystemNotification) {
        void showSystemTaskCompletionNotification(completion);
      }
    }
  }, [navigate, threads]);

  return null;
}

export function buildNotificationSettingsSupportText(
  permissionState: BrowserNotificationPermissionState,
): string {
  if (isElectron) {
    return "Desktop app notifications use your operating system notification center.";
  }
  switch (permissionState) {
    case "granted":
      return "Browser notifications are enabled for this app.";
    case "denied":
      return "Browser notifications are blocked. Re-enable them in your browser site settings.";
    case "insecure":
      return "Browser notifications need a secure context. Localhost works; plain HTTP does not.";
    case "unsupported":
      return "This browser does not support desktop notifications.";
    case "default":
      return "Allow browser notifications to get alerts when a thread finishes in the background.";
  }
}
