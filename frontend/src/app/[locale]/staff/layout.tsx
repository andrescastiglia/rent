"use client";

import MainLayout from "@/components/layout/MainLayout";

export default function StaffLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
