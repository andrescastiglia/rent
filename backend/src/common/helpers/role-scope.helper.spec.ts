import { UserRole } from '../../users/entities/user.entity';
import {
  getUserRoles,
  hasAnyRole,
  hasRole,
  isAdminOrStaff,
  isOwnerRole,
  isTenantRole,
} from './role-scope.helper';

describe('role-scope helpers', () => {
  it('uses the canonical role set and removes duplicates', () => {
    expect(
      getUserRoles({
        role: UserRole.OWNER,
        roles: [UserRole.OWNER, UserRole.TENANT, UserRole.TENANT],
      }),
    ).toEqual([UserRole.OWNER, UserRole.TENANT]);
  });

  it('falls back to the legacy primary role', () => {
    expect(getUserRoles({ role: UserRole.BUYER })).toEqual([UserRole.BUYER]);
    expect(isTenantRole(UserRole.TENANT)).toBe(true);
    expect(isOwnerRole(UserRole.TENANT)).toBe(false);
  });

  it('evaluates internal and simultaneous roles', () => {
    const subject = {
      role: UserRole.OWNER,
      roles: [UserRole.OWNER, UserRole.STAFF],
    };
    expect(hasRole(subject, UserRole.OWNER)).toBe(true);
    expect(hasAnyRole(subject, [UserRole.TENANT, UserRole.STAFF])).toBe(true);
    expect(isAdminOrStaff(subject)).toBe(true);
  });
});
