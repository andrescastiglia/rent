"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { Home, FileText, CreditCard, Wrench, LogOut, Loader2 } from "lucide-react";

export default function TenantPortalLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useLocalizedRouter();
  const locale = useLocale();
  const t = useTranslations("tenantPortal");
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "tenant") {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  if (!user || user.role !== "tenant") {
    return null;
  }

  const navItems = [
    {
      href: `/${locale}/portal/tenant`,
      label: t("dashboard"),
      icon: Home,
      exact: true,
    },
    {
      href: `/${locale}/portal/tenant/contract`,
      label: t("myContract"),
      icon: FileText,
      exact: false,
    },
    {
      href: `/${locale}/portal/tenant/payments`,
      label: t("myPayments"),
      icon: CreditCard,
      exact: false,
    },
    {
      href: `/${locale}/portal/tenant/maintenance`,
      label: t("maintenance"),
      icon: Wrench,
      exact: false,
    },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              RentApp
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {user.firstName} {user.lastName}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {children}
      </main>

      {/* Bottom tab navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-10">
        <div className="max-w-2xl mx-auto flex">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
