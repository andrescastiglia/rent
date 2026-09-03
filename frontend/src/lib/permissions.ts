import type {
  User,
  UserModulePermissionKey,
  UserModulePermissions,
} from "@/types/auth";

export function hasModuleAccess(
  role: User["role"],
  permissions: UserModulePermissions | undefined,
  moduleKey?: UserModulePermissionKey,
): boolean {
  if (role !== "staff") {
    return true;
  }
  return moduleKey ? permissions?.[moduleKey] === true : false;
}

export type RoleAwareUser = Pick<User, "role" | "roles" | "permissions">;

export function getUserRoles(
  user: Pick<User, "role" | "roles"> | null | undefined,
): User["role"][] {
  if (!user) return [];
  return user.roles?.length ? user.roles : [user.role];
}

export function hasUserRole(
  user: Pick<User, "role" | "roles"> | null | undefined,
  role: User["role"],
): boolean {
  return getUserRoles(user).includes(role);
}

export function isInternalUser(
  user: Pick<User, "role" | "roles"> | null | undefined,
): boolean {
  const roles = getUserRoles(user);
  return roles.includes("admin") || roles.includes("staff");
}

export function canUserAccessModule(
  user: RoleAwareUser,
  allowedRoles: string[],
  moduleKey?: UserModulePermissionKey,
): boolean {
  const roles = getUserRoles(user);
  if (roles.includes("admin") && allowedRoles.includes("admin")) return true;
  if (roles.some((role) => role !== "staff" && allowedRoles.includes(role))) {
    return true;
  }
  return (
    roles.includes("staff") &&
    allowedRoles.includes("staff") &&
    hasModuleAccess("staff", user.permissions, moduleKey)
  );
}

export function canManageLeases(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function canManageLeasesForUser(
  user: Pick<User, "role" | "roles"> | null | undefined,
): boolean {
  return isInternalUser(user);
}

export function canManageTenants(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export const canManageTenantsForUser = canManageLeasesForUser;

export function canManageOwners(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export const canManageOwnersForUser = canManageLeasesForUser;
