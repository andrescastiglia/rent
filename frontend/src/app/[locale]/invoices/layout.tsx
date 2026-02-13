"use client";

import MainLayout from "@/components/layout/MainLayout";
import { RoleGuard } from "@/components/common/RoleGuard";

export default function InvoicesLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <MainLayout>
      <RoleGuard allowedRoles={["admin", "owner", "tenant", "staff"]}>
        {children}
      </RoleGuard>
    </MainLayout>
  );
}
