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
  if (roles.includes("staff"))
    return (
      allowedRoles.includes("staff") &&
      hasModuleAccess("staff", user.permissions, moduleKey)
    );
  return roles.some((role) => allowedRoles.includes(role));
}

export function canManageLeases(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function canManageLeasesForUser(
  user: RoleAwareUser | null | undefined,
): boolean {
  return Boolean(
    user && canUserAccessModule(user, ["admin", "staff"], "leases"),
  );
}

export function canManageTenants(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function canManageTenantsForUser(
  user: RoleAwareUser | null | undefined,
): boolean {
  return Boolean(
    user && canUserAccessModule(user, ["admin", "staff"], "tenants"),
  );
}

export function canManageOwners(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function canManageOwnersForUser(
  user: RoleAwareUser | null | undefined,
): boolean {
  return Boolean(
    user && canUserAccessModule(user, ["admin", "staff"], "owners"),
  );
}
