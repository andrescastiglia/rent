"use client";
import { RoleGuard } from "@/components/common/RoleGuard";
import { MercadoLibreConnection } from "@/components/integrations/MercadoLibreConnection";
import { useAuth } from "@/contexts/auth-context";
export default function MercadoLibreSettingsPage() {
  const { user } = useAuth();
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <MercadoLibreConnection key={`${user?.companyId}:${user?.id}`} />
    </RoleGuard>
  );
}
