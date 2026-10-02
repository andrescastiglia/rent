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
  let content = <p role="alert">{t("sessionRequired")}</p>;
  if (loading) content = <output>{t("loading")}</output>;
  else if (user && hasUserRole(user, "admin"))
    content = (
      <MercadoLibreConnection
        key={`${user.companyId}:${user.id}`}
        callback={callback}
      />
    );
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      {content}
      <Link
        href={`/${locale}/${user ? "settings/mercadolibre" : "login"}`}
        className="underline"
      >
        {t("back")}
      </Link>
    </main>
  );
}
