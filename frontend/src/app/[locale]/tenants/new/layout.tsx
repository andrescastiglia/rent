"use client";

import { RoleGuard } from "@/components/common/RoleGuard";

export default function NewTenantLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <RoleGuard allowedRoles={["admin", "staff"]}>{children}</RoleGuard>;
}
