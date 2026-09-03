import { UserRole } from '../../users/entities/user.entity';

export type RoleAware = {
  role?: UserRole | string | null;
  roles?: readonly (UserRole | string)[] | null;
};

export function getUserRoles(subject: RoleAware): UserRole[] {
  const candidates = subject.roles?.length
    ? subject.roles
    : subject.role
      ? [subject.role]
      : [];
  return [...new Set(candidates)].filter((role): role is UserRole =>
    Object.values(UserRole).includes(role as UserRole),
  );
}

export function hasRole(subject: RoleAware, role: UserRole): boolean {
  return getUserRoles(subject).includes(role);
}

export function hasAnyRole(
  subject: RoleAware,
  roles: readonly UserRole[],
): boolean {
  const actualRoles = getUserRoles(subject);
  return roles.some((role) => actualRoles.includes(role));
}

export function isTenantRole(subject: RoleAware | UserRole): boolean {
  return hasRole(normalizeSubject(subject), UserRole.TENANT);
}

export function isOwnerRole(subject: RoleAware | UserRole): boolean {
  return hasRole(normalizeSubject(subject), UserRole.OWNER);
}

export function isAdminOrStaff(subject: RoleAware | UserRole): boolean {
  return hasAnyRole(normalizeSubject(subject), [
    UserRole.ADMIN,
    UserRole.STAFF,
  ]);
}

function normalizeSubject(subject: RoleAware | UserRole): RoleAware {
  return typeof subject === 'string' ? { role: subject } : subject;
}
