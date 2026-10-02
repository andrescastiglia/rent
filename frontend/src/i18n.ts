import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { locale as getRootLocale } from "next/root-params";

// Supported locales
const locales = new Set(["es", "pt", "en"]);

export default getRequestConfig(async ({ locale: override }) => {
  const locale = override ?? (await getRootLocale());

  // Validate that the incoming `locale` parameter is valid
  if (!locale || !locales.has(locale)) notFound();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
