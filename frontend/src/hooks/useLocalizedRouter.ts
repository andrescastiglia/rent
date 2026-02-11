"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Hook that wraps Next.js router to automatically include locale prefix in navigation
 */
export function useLocalizedRouter() {
  const router = useRouter();
  const pathname = usePathname();

  // Extract current locale from pathname
  const locale = useMemo(() => {
    const segments = pathname.split("/");
    const possibleLocale = segments[1];
    if (["es", "pt", "en"].includes(possibleLocale)) {
      return possibleLocale;
    }
    return "es"; // fallback
  }, [pathname]);

  // Helper to prefix path with locale if not already present
  const localizePath = useCallback(
    (path: string) => {
      if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
        return path;
      }
      // Remove leading slash for concatenation
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return `/${locale}/${cleanPath}`;
    },
    [locale],
  );

  const push = useCallback(
    (path: string) => {
      router.push(localizePath(path));
    },
    [router, localizePath],
  );

  const replace = useCallback(
    (path: string) => {
      router.replace(localizePath(path));
    },
    [router, localizePath],
  );

  const back = useCallback(() => {
    router.back();
  }, [router]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return {
    push,
    replace,
    back,
    refresh,
    locale,
    localizePath,
  };
}
