"use client";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { OwnerPayouts } from "@/components/integrations/OwnerPayouts";
export default function OwnerSettlementPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  if (!user?.companyId) return null;
  return (
    <OwnerPayouts
      key={`${user.companyId}:${user.id}:${id}`}
      ownerId={id}
      scopeKey={`${user.companyId}:${user.id}`}
    />
  );
}
