"use client";
import { useParams } from "next/navigation";
import { RoleGuard } from "@/components/common/RoleGuard";
import { PortalPublicationReview } from "@/components/integrations/PortalPublicationReview";
import { useAuth } from "@/contexts/auth-context";
export default function PropertyPortalsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <PortalPublicationReview
        key={`${user?.companyId}:${user?.id}:${id}`}
        propertyId={id}
      />
    </RoleGuard>
  );
}
