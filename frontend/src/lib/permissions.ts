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

export function canManageLeases(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function canManageTenants(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}

export function canManageOwners(role: User["role"] | undefined): boolean {
  return role === "admin" || role === "staff";
}
