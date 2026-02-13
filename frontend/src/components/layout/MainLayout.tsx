"use client";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import AiAssistantPanel from "@/components/ai/AiAssistantPanel";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { aiApi, AiToolsMode } from "@/lib/api/ai";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface MainLayoutProps {
  readonly children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, token, loading } = useAuth();
  const router = useLocalizedRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiToolsMode>("NONE");
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
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
        setAiMode(status.mode);
      } catch {
        if (!isMounted) return;
        setAiMode("NONE");
      }
    };

    void loadAiMode();

    return () => {
      isMounted = false;
    };
  }, [user, token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        aiEnabled={aiMode !== "NONE"}
        aiPanelOpen={isAiPanelOpen && aiMode !== "NONE"}
        onAiToggle={() => {
          if (aiMode === "NONE") return;
          setIsAiPanelOpen((prev) => !prev);
        }}
      />
      <div className="flex flex-1">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto">
            <Breadcrumbs />
            {children}
          </div>
          <AiAssistantPanel
            isOpen={isAiPanelOpen && aiMode !== "NONE"}
            mode={aiMode}
            onClose={() => setIsAiPanelOpen(false)}
          />
        </main>
      </div>
      <Footer />
    </div>
  );
}
