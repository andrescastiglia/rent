'use client';

import MainLayout from '@/components/layout/MainLayout';
import { RoleGuard } from '@/components/common/RoleGuard';

export default function PropertiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MainLayout>
      <RoleGuard allowedRoles={['admin', 'owner']}>
        {children}
      </RoleGuard>
    </MainLayout>
  );
}
