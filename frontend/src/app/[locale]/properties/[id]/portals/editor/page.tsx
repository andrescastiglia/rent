"use client";
import { useParams } from "next/navigation";
import { RoleGuard } from "@/components/common/RoleGuard";
import { useAuth } from "@/contexts/auth-context";
import { MercadoLibreListingEditor } from "@/components/integrations/MercadoLibreListingEditor";
export default function ListingEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <MercadoLibreListingEditor
        key={`${user?.companyId}:${user?.id}:${id}`}
        propertyId={id}
      />
    </RoleGuard>
  );
}
