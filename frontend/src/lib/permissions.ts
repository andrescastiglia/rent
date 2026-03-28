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
  if (role !== "staff" || !moduleKey) {
    return true;
  }

  if (!permissions || Object.keys(permissions).length === 0) {
    return true;
  }

  return permissions[moduleKey] === true;
}
