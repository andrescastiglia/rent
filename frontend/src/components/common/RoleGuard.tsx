"use client";

import React from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ShieldX, Loader2 } from "lucide-react";

/**
 * Props for the RoleGuard component.
 */
interface RoleGuardProps {
  /** List of roles that are allowed to access the content */
  readonly allowedRoles: string[];
  /** Content to render if access is granted */
  readonly children: React.ReactNode;
  /** Optional: redirect to this path if access denied (defaults to showing message) */
  readonly redirectTo?: string;
}

/**
 * RoleGuard protects content based on user role.
 * If the user's role is not in the allowedRoles list, shows an access denied message
 * or redirects to the specified path.
 * @param props - RoleGuard component props
 * @returns Protected content or access denied UI
 */
export function RoleGuard({
  allowedRoles,
  children,
  redirectTo,
}: RoleGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("common");

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  // If no user, MainLayout will handle redirect to login
  if (!user) {
    return null;
  }

  // Check if user's role is allowed
  const hasAccess = allowedRoles.includes(user.role);

  if (!hasAccess) {
    // If redirectTo is specified, redirect
    if (redirectTo) {
      router.replace(`/${locale}${redirectTo}`);
      return null;
    }

    // Otherwise, show access denied message
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <ShieldX className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t("accessDenied")}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          {t("accessDeniedMessage")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
