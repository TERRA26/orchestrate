import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmbeddedBrowserPane } from "./EmbeddedBrowserPane";
import { OrchestratorPanel } from "./OrchestratorPanel";
import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail } from "./ui/sidebar";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "open-settings") return;
      void navigate({ to: "/settings" });
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-white/8 text-foreground supports-[backdrop-filter]:bg-transparent supports-[backdrop-filter]:backdrop-blur-2xl [&>[data-slot=sidebar-inner]]:border-r-0 [&>[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,rgba(55,58,70,0.76),rgba(42,45,56,0.64))] [&>[data-slot=sidebar-inner]]:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        resizable={{
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      <OrchestratorPanel />
      <div className="min-w-0 flex-1">{children}</div>
      <EmbeddedBrowserPane currentThreadId={null} />
    </SidebarProvider>
  );
}
