import { UserRole } from '../users/entities/user.entity';
import { AiToolDefinition } from './types/ai-tool.types';
import { getUserRoles, RoleAware } from '../common/helpers/role-scope.helper';

const SELF_SERVICE_ROLES = new Set<UserRole>([
  UserRole.OWNER,
  UserRole.TENANT,
  UserRole.BUYER,
]);

const SELF_SERVICE_READ_TOOLS = new Set([
  'get_auth_profile',
  'get_users_profile_me',
]);

export const canRoleUseAiTool = (
  definition: AiToolDefinition,
  role: UserRole,
): boolean => {
  if (definition.mutability === 'mutable') {
    return role === UserRole.ADMIN || role === UserRole.STAFF;
  }

  if (
    SELF_SERVICE_ROLES.has(role) &&
    !SELF_SERVICE_READ_TOOLS.has(definition.name)
  ) {
    return false;
  }

  return definition.allowedRoles.includes(role);
};

export const canRolesUseAiTool = (
  definition: AiToolDefinition,
  subject: RoleAware,
): boolean =>
  getUserRoles(subject).some((role) => canRoleUseAiTool(definition, role));
