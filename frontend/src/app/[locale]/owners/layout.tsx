"use client";

import MainLayout from "@/components/layout/MainLayout";
import { RoleGuard } from "@/components/common/RoleGuard";

export default function OwnersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MainLayout>
      <RoleGuard
        allowedRoles={["admin", "owner", "staff"]}
        requiredModule="owners"
      >
        {children}
      </RoleGuard>
    </MainLayout>
  );
}
