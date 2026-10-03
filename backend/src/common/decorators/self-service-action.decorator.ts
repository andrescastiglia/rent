import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

export const SELF_SERVICE_ACTION_KEY = 'self-service-action';

const externalRoles = [UserRole.OWNER, UserRole.TENANT, UserRole.BUYER];

/**
 * Explicit exceptions to external users' read-only access. Controllers still
 * enforce their declared roles, and domain services must verify the resource's
 * company and the actor's current relationship before reading or writing it.
 */
export const SELF_SERVICE_ACTIONS = {
  'ai.read': { method: 'POST', roles: externalRoles },
  'phone.preview': { method: 'POST', roles: externalRoles },
  'geo.eta': { method: 'POST', roles: [UserRole.OWNER, UserRole.TENANT] },
  'profile.update': { method: 'PATCH', roles: externalRoles },
  'profile.change-password': { method: 'POST', roles: externalRoles },
  'maintenance.request': {
    method: 'POST',
    roles: [UserRole.OWNER, UserRole.TENANT],
  },
  'maintenance.comment': {
    method: 'POST',
    roles: [UserRole.OWNER, UserRole.TENANT],
  },
  'maintenance.attachment.upload': {
    method: 'POST',
    roles: [UserRole.OWNER, UserRole.TENANT],
  },
  'maintenance.attachment.confirm': {
    method: 'PATCH',
    roles: [UserRole.OWNER, UserRole.TENANT],
  },
  'checkout.create': { method: 'POST', roles: [UserRole.TENANT] },
  'amendment.create': { method: 'POST', roles: [UserRole.OWNER] },
  'amendment.submit': { method: 'PATCH', roles: [UserRole.OWNER] },
  'amendment.approve': { method: 'PATCH', roles: [UserRole.OWNER] },
  'amendment.reject': { method: 'PATCH', roles: [UserRole.OWNER] },
} satisfies Record<string, { method: string; roles: UserRole[] }>;

export type SelfServiceActionName = keyof typeof SELF_SERVICE_ACTIONS;

/** Apply only to the specific handler authorized for this domain action. */
export const SelfServiceAction = (action: SelfServiceActionName) =>
  SetMetadata(SELF_SERVICE_ACTION_KEY, action);
