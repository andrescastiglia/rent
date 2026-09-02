"use client";

import { RoleGuard } from "@/components/common/RoleGuard";

export default function NewOwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <RoleGuard allowedRoles={["admin", "staff"]}>{children}</RoleGuard>;
}
