"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

type Locale = "es" | "pt" | "en";

const languages = [
  { code: "es" as Locale, name: "Español", flag: "🇪🇸" },
  { code: "pt" as Locale, name: "Português", flag: "🇧🇷" },
  { code: "en" as Locale, name: "English", flag: "🇺🇸" },
];

export default function LanguageSelector() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const t = useTranslations("common");

  const currentLanguage =
    languages.find((lang) => lang.code === locale) || languages[0];

  /**
   * Cambia el idioma de la aplicación
   * @param newLocale - Nuevo locale a establecer
   */
  const handleLanguageChange = (newLocale: Locale) => {
    setIsOpen(false);

    // Guardar preferencia en localStorage
    localStorage.setItem("NEXT_LOCALE", newLocale);

    startTransition(() => {
      // Reemplazar el locale en la URL
      const currentPath = pathname;
      const newPath = currentPath.replace(`/${locale}`, `/${newLocale}`);

      // Si la ruta no tiene locale, agregar el nuevo
      const hasLocalePrefix = currentPath.startsWith(`/${locale}`);
      const finalPath = hasLocalePrefix
        ? newPath
        : `/${newLocale}${currentPath}`;
      // Perform a full navigation so the app is reloaded with the new locale
      if (globalThis.window === undefined) {
        router.replace(finalPath);
        return;
      }

      globalThis.window.location.assign(finalPath);
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={t("selectLanguage")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        disabled={isPending}
      >
        <Globe className="w-5 h-5" />
        <span className="hidden sm:inline text-sm font-medium">
          {currentLanguage.flag} {currentLanguage.code.toUpperCase()}
        </span>
      </button>

      {isOpen && (
        <>
          {/* Overlay para cerrar al hacer click fuera */}
          <button
            type="button"
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-label={t("closeMenu")}
          />

          {/* Dropdown menu */}
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20"
          >
            <div className="py-1">
              {languages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => handleLanguageChange(language.code)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors ${
                    locale === language.code
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  disabled={isPending}
                  role="menuitemradio"
                  aria-checked={locale === language.code}
                >
                  <span className="text-xl">{language.flag}</span>
                  <span className="font-medium">{language.name}</span>
                  {locale === language.code && (
                    <span className="ml-auto text-blue-600 dark:text-blue-400">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
