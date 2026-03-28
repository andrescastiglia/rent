"use client";

import MainLayout from "@/components/layout/MainLayout";
import { RoleGuard } from "@/components/common/RoleGuard";

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <MainLayout>
      <RoleGuard
        allowedRoles={["admin", "owner", "tenant", "staff"]}
        requiredModule="dashboard"
      >
        {children}
      </RoleGuard>
    </MainLayout>
  );
}
