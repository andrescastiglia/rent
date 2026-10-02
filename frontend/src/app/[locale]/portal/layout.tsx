"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { Loader2 } from "lucide-react";
import ContextualGuidance from "@/components/common/ContextualGuidance";

export default function PortalLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useLocalizedRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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
    <React.Fragment key={`${user.companyId ?? ""}:${user.id}`}>
      <div id="portal-content" className="min-w-0">
        {children}
      </div>
      <ContextualGuidance rootId="portal-content" />
    </React.Fragment>
  );
}
