"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { Menu } from "lucide-react";
import LanguageSelector from "@/components/ui/LanguageSelector";
import { useLocale, useTranslations } from "next-intl";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");
  const locale = useLocale();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-xs border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Mobile menu button */}
          {user && (
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 mr-2"
              aria-label={t("closeMenu")}
            >
              <Menu className="w-6 h-6" />
            </button>
          )}

          {/* Logo - centered on mobile */}
          <div className="flex-1 flex items-center justify-center lg:justify-start">
            <Link href={`/${locale}/dashboard`} className="flex items-center">
              <Image
                src="/logo.svg"
                alt="Rent"
                width={64}
                height={26}
                priority
              />
            </Link>
          </div>

          {/* Language Selector and User Menu */}
          <div className="flex items-center gap-2">
            <LanguageSelector />

            {user && (
              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="flex items-center space-x-3 text-sm focus:outline-hidden"
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </div>
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {user.role}
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-500 hidden md:block"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-10 border border-gray-200 dark:border-gray-700">
                    <div
                      className="block px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      title={t("comingSoon")}
                    >
                      {t("settings")}
                    </div>
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        logout();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {tAuth("logout")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
