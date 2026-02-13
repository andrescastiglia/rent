import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import "../../styles/globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { locales } from "@/config/locales";
import type { Locale } from "@/config/locales";
import { ToastHost } from "@/components/common/ToastHost";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: React.ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Validar que el locale es soportado
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Obtener mensajes para el locale actual
  const messages = await getMessages();

  return (
    <html lang={locale} className="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var root = document.documentElement;
                  var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                  var applyTheme = function(isDark) {
                    root.classList.toggle('dark', isDark);
                    root.classList.toggle('light', !isDark);
                  };
                  applyTheme(mediaQuery.matches);
                  if (typeof mediaQuery.addEventListener === 'function') {
                    mediaQuery.addEventListener('change', function(event) {
                      applyTheme(event.matches);
                    });
                  } else if (typeof mediaQuery.addListener === 'function') {
                    mediaQuery.addListener(function(event) {
                      applyTheme(event.matches);
                    });
                  }
                } catch (error) {}
              })();
            `,
          }}
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ToastHost />
            {children}
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
