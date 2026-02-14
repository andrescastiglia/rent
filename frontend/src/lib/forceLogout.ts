import { clearAuth } from "./auth";
import { locales, defaultLocale } from "@/config/locales";

function getLocaleFromPathname(pathname: string): string {
  const segment = pathname.split("/")[1];
  if (locales.includes(segment as any)) return segment;
  return defaultLocale;
}

export function forceLogout(): void {
  if (typeof window === "undefined") return; // NOSONAR

  clearAuth();

  const pathname = window.location.pathname || "/"; // NOSONAR
  const locale = getLocaleFromPathname(pathname);

  // Avoid redirect loops.
  const loginPath = `/${locale}/login`;
  if (pathname.startsWith(loginPath)) return;

  window.location.assign(loginPath); // NOSONAR
}
