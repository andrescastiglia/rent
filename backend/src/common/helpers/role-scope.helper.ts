import { UserRole } from '../../users/entities/user.entity';

export function isTenantRole(role: UserRole): boolean {
  return role === UserRole.TENANT;
}

export function isOwnerRole(role: UserRole): boolean {
  return role === UserRole.OWNER;
}

export function isAdminOrStaff(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.STAFF;
}
