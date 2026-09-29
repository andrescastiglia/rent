"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { hasUserRole } from "@/lib/permissions";
import {
  readAuthorizationCallback,
  type MercadoLibreCallback as CallbackData,
} from "@/lib/api/mercadolibre";
import { MercadoLibreConnection } from "./MercadoLibreConnection";

export function MercadoLibreCallback() {
  const { user, loading } = useAuth();
  const locale = useLocale();
  const t = useTranslations("mercadoLibre");
  const captured = useRef(false);
  const [callback, setCallback] = useState<CallbackData | null>(null);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const data = readAuthorizationCallback(window.location.search);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
    setCallback(data);
  }, []);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      {loading ? (
        <p role="status">{t("loading")}</p>
      ) : user && hasUserRole(user, "admin") ? (
        <MercadoLibreConnection
          key={`${user.companyId}:${user.id}`}
          callback={callback}
        />
      ) : (
        <p role="alert">{t("sessionRequired")}</p>
      )}
      <Link
        href={`/${locale}/${user ? "settings/mercadolibre" : "login"}`}
        className="underline"
      >
        {t("back")}
      </Link>
    </main>
  );
}
