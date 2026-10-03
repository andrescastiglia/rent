"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { maintenanceApi } from "@/lib/api/maintenance";
import type { MaintenanceTicket } from "@/types/maintenance";
import { RoleGuard } from "@/components/common/RoleGuard";
import TicketDetailPanel from "@/components/maintenance/TicketDetailPanel";
export default function Page() {
  const { id } = useParams<{ id: string }>(),
    locale = useLocale(),
    t = useTranslations("agenda");
  const [ticket, setTicket] = useState<MaintenanceTicket>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    maintenanceApi
      .getOne(id)
      .then((d) => {
        if (active) setTicket(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <RoleGuard allowedRoles={["admin", "staff"]} requiredModule="maintenance">
      <Link className="underline" href={`/${locale}/maintenance`}>
        {t("openSource")}
      </Link>
      {error && <p role="alert">{error}</p>}
      {ticket && (
        <TicketDetailPanel
          ticket={ticket}
          canManage
          onClose={() => setTicket(undefined)}
          onUpdated={setTicket}
        />
      )}
    </RoleGuard>
  );
}
