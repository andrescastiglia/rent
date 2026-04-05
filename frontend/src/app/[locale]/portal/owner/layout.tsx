"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { Building2, FileText, LayoutDashboard } from "lucide-react";

export default function OwnerPortalLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useLocalizedRouter();
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("ownerPortal");

  useEffect(() => {
    if (user && user.role !== "owner" && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, router]);

  if (!user) return null;

  const ownerBase = `/${locale}/portal/owner`;

  const tabs = [
    {
      href: ownerBase,
      label: t("nav.home"),
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: `${ownerBase}/properties`,
      label: t("nav.properties"),
      icon: Building2,
      exact: false,
    },
    {
      href: `${ownerBase}/settlements`,
      label: t("nav.settlements"),
      icon: FileText,
      exact: false,
    },
  ];

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("title")}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {user.firstName} {user.lastName}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-10">
        <div className="max-w-2xl mx-auto flex">
          {tabs.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${active ? "text-blue-600 dark:text-blue-400" : ""}`}
                />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
