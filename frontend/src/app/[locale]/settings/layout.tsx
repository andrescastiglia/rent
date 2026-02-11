"use client";

import MainLayout from "@/components/layout/MainLayout";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
