"use client";

import MainLayout from "@/components/layout/MainLayout";
import { RoleGuard } from "@/components/common/RoleGuard";

export default function InterestedLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <MainLayout>
      <RoleGuard allowedRoles={["admin", "staff"]}>{children}</RoleGuard>
    </MainLayout>
  );
}
