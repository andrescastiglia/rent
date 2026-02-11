import type { Locale } from "./config/locales";

declare global {
  // Use type safe messages keys with `next-intl`
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {}
}

// Declara el tipo para el config de next-intl
declare module "next-intl/config" {
  interface AppConfig {
    Locale: Locale;
  }
}
