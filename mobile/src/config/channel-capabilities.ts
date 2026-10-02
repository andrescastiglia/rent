import { API_URL } from '@/api/env';
import {
  canUserAccessPath,
  getUserRoles,
  isInternalUser,
  type NavigationUser,
} from '@/config/navigation';

export type ChannelCapability = {
  id: string;
  labelKey: string;
  webPath: string;
};
/** Explicit browser alternatives retain authentication and the server's resource authorization. */
export function getWebCapabilities(user: NavigationUser): ChannelCapability[] {
  const roles = getUserRoles(user);
  const capabilities: ChannelCapability[] = [];
  const internal = isInternalUser(user);
  const authorizedInternal = (path: string) =>
    internal && canUserAccessPath(user, path);
  const salesPath =
    roles.includes('buyer') && !internal ? '/portal/buyer' : '/sales';
  if (roles.includes('owner'))
    capabilities.push(
      {
        id: 'ownerSummary',
        labelKey: 'channels.ownerSummary',
        webPath: '/portal/owner',
      },
      {
        id: 'ownerMaintenance',
        labelKey: 'channels.maintenance',
        webPath: '/portal/owner/maintenance',
      },
      {
        id: 'ownerSettlements',
        labelKey: 'channels.ownerSettlements',
        webPath: '/portal/owner/settlements',
      },
    );
  if (roles.includes('tenant'))
    capabilities.push(
      {
        id: 'tenantAccount',
        labelKey: 'channels.tenantAccount',
        webPath: '/portal/tenant',
      },
      {
        id: 'tenantMaintenance',
        labelKey: 'channels.maintenance',
        webPath: '/portal/tenant/maintenance',
      },
    );
  if (authorizedInternal('/maintenance'))
    capabilities.push({
      id: 'maintenance',
      labelKey: 'channels.maintenance',
      webPath: '/maintenance',
    });
  if (authorizedInternal('/payments'))
    capabilities.push({
      id: 'paymentAdjustments',
      labelKey: 'channels.paymentAdjustments',
      webPath: '/payments',
    });
  if (authorizedInternal('/invoices'))
    capabilities.push({
      id: 'invoiceDocuments',
      labelKey: 'channels.invoiceDocuments',
      webPath: '/invoices',
    });
  if (canUserAccessPath(user, '/leases/new'))
    capabilities.push({
      id: 'leaseAmendments',
      labelKey: 'channels.leaseAmendments',
      webPath: '/leases',
    });
  if (canUserAccessPath(user, '/sales'))
    capabilities.push({
      id: 'salesInstallments',
      labelKey: 'channels.salesInstallments',
      webPath: salesPath,
    });
  if (canUserAccessPath(user, '/buyers'))
    capabilities.push({
      id: 'buyers',
      labelKey: 'channels.buyers',
      webPath: '/buyers',
    });
  if (authorizedInternal('/dashboard') && canUserAccessPath(user, '/ai'))
    capabilities.push({
      id: 'proposalReview',
      labelKey: 'channels.proposalReview',
      webPath: '/dashboard#pending-actions',
    });
  return capabilities;
}

export function authenticatedWebUrl(path: string, language = 'es'): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://'))
    throw new Error('Invalid application path');
  const origin =
    process.env.EXPO_PUBLIC_WEB_URL?.trim() || new URL(API_URL).origin;
  const locale = ['es', 'en', 'pt'].includes(language) ? language : 'es';
  return `${origin.replace(/\/$/, '')}/${locale}${path}`;
}
