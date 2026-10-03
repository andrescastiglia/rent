"use client";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import AiAssistantPanel from "@/components/ai/AiAssistantPanel";
import ContextualGuidance from "@/components/common/ContextualGuidance";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { aiApi, AiToolsMode } from "@/lib/api/ai";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

interface MainLayoutProps {
  readonly children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, token, loading } = useAuth();
  const router = useLocalizedRouter();
  const t = useTranslations("common");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const conversationScope = user
    ? `${user.companyId ?? "global"}:${user.id}`
    : "";
  const [aiStatus, setAiStatus] = useState<{
    scope: string;
    mode: AiToolsMode;
  } | null>(null);
  const aiMode =
    token && aiStatus?.scope === conversationScope ? aiStatus.mode : "NONE";
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      if (
        /^\/(es|en|pt)\/(agenda|notifications)(\/|$)/.test(
          window.location.pathname,
        )
      )
        sessionStorage.setItem(
          "rent.returnTo",
          window.location.pathname +
            window.location.search +
            window.location.hash,
        );
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !token) return;

    let isMounted = true;

    const loadAiMode = async () => {
      try {
        const status = await aiApi.getToolsStatus();
        if (!isMounted) return;
        setAiStatus({ scope: conversationScope, mode: status.mode });
      } catch {
        if (!isMounted) return;
        setAiStatus({ scope: conversationScope, mode: "NONE" });
      }
    };

    void loadAiMode();

    return () => {
      isMounted = false;
    };
  }, [conversationScope, user, token]);

  if (loading) {
    return (
      <output className="flex min-h-screen items-center justify-center gap-3 text-muted">
        <Loader2
          className="animate-spin h-6 w-6 text-primary"
          aria-hidden="true"
        />
        <span>{t("loading")}</span>
      </output>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-background">
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <Header
        onMenuToggle={() => setSidebarOpen((open) => !open)}
        aiEnabled={aiMode !== "NONE"}
        aiPanelOpen={isAiPanelOpen && aiMode !== "NONE"}
        sidebarOpen={sidebarOpen}
        onAiToggle={() => {
          if (aiMode === "NONE") return;
          setIsAiPanelOpen((prev) => !prev);
        }}
      />
      <div className="flex min-w-0 flex-1 items-start">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        <main
          id="main-content"
          tabIndex={-1}
          data-sidebar-background
          className="min-w-0 w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 xl:px-8"
        >
          <div
            key={`content:${conversationScope}`}
            className="mx-auto min-w-0 max-w-7xl"
          >
            <Breadcrumbs />
            {children}
          </div>
          <AiAssistantPanel
            key={conversationScope}
            conversationScope={conversationScope}
            isOpen={isAiPanelOpen && aiMode !== "NONE"}
            mode={aiMode}
            onClose={() => setIsAiPanelOpen(false)}
          />
        </main>
      </div>
      <ContextualGuidance />
      <Footer />
    </div>
  );
}
