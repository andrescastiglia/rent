"use client";

import { RoleGuard } from "@/components/common/RoleGuard";

export default function CommunicationsSettingsLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <RoleGuard
      allowedRoles={["admin", "staff"]}
      requiredModule="communications"
    >
      {children}
    </RoleGuard>
  );
}
