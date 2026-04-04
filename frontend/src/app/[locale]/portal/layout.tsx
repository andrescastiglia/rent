"use client";

import React from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

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

  return <>{children}</>;
}
