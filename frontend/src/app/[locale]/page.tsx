"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("common");
  const locale = useLocale();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace(`/${locale}/dashboard`);
      } else {
        router.replace(`/${locale}/login`);
      }
    }
  }, [user, loading, router, locale]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Loader2 className="animate-spin h-12 w-12 text-blue-500" />
      <p className="mt-4 text-gray-600">{t("loading")}</p>
    </main>
  );
}
