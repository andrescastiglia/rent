"use client";

import MainLayout from "@/components/layout/MainLayout";
import { RoleGuard } from "@/components/common/RoleGuard";

export default function TemplatesLayout({
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
