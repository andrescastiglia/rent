import { clearAuth } from "./auth";
import { locales, defaultLocale } from "@/config/locales";

function getLocaleFromPathname(pathname: string): string {
  const segment = pathname.split("/")[1];
  if (locales.includes(segment as any)) return segment;
  return defaultLocale;
}

export function forceLogout(): void {
  if (typeof globalThis === "undefined") return;

  clearAuth();

  const pathname = globalThis.location.pathname || "/";
  const locale = getLocaleFromPathname(pathname);

  // Avoid redirect loops.
  const loginPath = `/${locale}/login`;
  if (pathname.startsWith(loginPath)) return;

  globalThis.location.assign(loginPath);
}
