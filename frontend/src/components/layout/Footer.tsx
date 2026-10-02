"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function Footer() {
  const locale = useLocale();
  const t = useTranslations("footer");
  const supportEmail = process.env.NEXT_PUBLIC_COMPANY_SUPPORT_EMAIL;
  return (
    <footer
      data-sidebar-background
      className="mt-auto border-t border-line bg-surface"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted sm:px-6">
        <p>{t("copyright", { year: new Date().getFullYear() })}</p>
        <nav
          aria-label={t("usefulLinks")}
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          <a
            className="inline-flex min-h-11 items-center hover:underline"
            href="https://github.com/andrescastiglia/rent/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("help")}
          </a>
          <Link
            className="inline-flex min-h-11 items-center hover:underline"
            href={`/${locale}/terms`}
          >
            {t("termsAndConditions")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center hover:underline"
            href={`/${locale}/privacy`}
          >
            {t("privacy")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center hover:underline"
            href={`/${locale}/data-deletion`}
          >
            {t("dataDeletion")}
          </Link>
          {supportEmail && (
            <a
              className="inline-flex min-h-11 items-center hover:underline"
              href={`mailto:${supportEmail}`}
            >
              {t("contact")}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
