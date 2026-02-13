"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getNavigationForRole } from "@/config/navigation";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

interface SidebarProps {
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  if (!user) return null;

  const navItems = getNavigationForRole(user.role);
  const sidebarTransformClass = isOpen
    ? "translate-x-0"
    : "-translate-x-full lg:translate-x-0";

  const getLinkClassName = (active: boolean, disabled?: boolean): string => {
    if (active && !disabled) {
      return "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400";
    }

    if (disabled) {
      return "text-gray-400 dark:text-gray-500 cursor-not-allowed";
    }

    return "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
          aria-label={tCommon("closeMenu")}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-200 ease-in-out
          ${sidebarTransformClass}
          pt-16 lg:pt-0
        `}
      >
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
          aria-label={tCommon("closeMenu")}
        >
          <X className="w-5 h-5" />
        </button>

        <nav className="h-full overflow-y-auto p-4 space-y-1 pt-8 lg:pt-4">
          {navItems.map((item) => {
            const localizedHref = `/${locale}${item.href}`;
            const isActive = pathname.startsWith(localizedHref);
            const isDisabled = item.disabled;
            const linkClassName = getLinkClassName(isActive, isDisabled);

            const linkContent = (
              <span
                className={`
                  block px-4 py-2 rounded-md text-sm font-medium transition-colors
                  ${linkClassName}
                `}
              >
                {t(item.labelKey)}
              </span>
            );

            return isDisabled ? (
              <div key={item.href} title={tCommon("comingSoon")}>
                {linkContent}
              </div>
            ) : (
              <Link key={item.href} href={localizedHref} onClick={onClose}>
                {linkContent}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
