"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { salesApi } from "@/lib/api/sales";
import type { SaleAgreement } from "@/types/sales";
import { RoleGuard } from "@/components/common/RoleGuard";
import SaleDetailPanel from "@/components/sales/SaleDetailPanel";
export default function Page() {
  const { id } = useParams<{ id: string }>(),
    locale = useLocale(),
    t = useTranslations("agenda");
  const [agreement, setAgreement] = useState<SaleAgreement>(),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    salesApi
      .getAgreement(id)
      .then((d) => {
        if (active) setAgreement(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  return (
    <RoleGuard allowedRoles={["admin", "staff"]} requiredModule="sales">
      <Link className="underline" href={`/${locale}/sales`}>
        {t("openSource")}
      </Link>
      {error && <p role="alert">{error}</p>}
      {agreement && (
        <SaleDetailPanel
          agreement={agreement}
          onChanged={() => setRevision((r) => r + 1)}
        />
      )}
    </RoleGuard>
  );
}
