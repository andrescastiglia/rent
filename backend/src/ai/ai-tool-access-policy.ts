import { UserModulePermissions, UserRole } from '../users/entities/user.entity';
import { AuthenticatedPolicy } from '../common/decorators/authenticated.decorator';
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
  if (!definition.allowedRoles.includes(role)) return false;
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
  subject: RoleAware & { permissions?: UserModulePermissions },
): boolean =>
  getUserRoles(subject).some((role) => {
    if (!canRoleUseAiTool(definition, role)) return false;
    if (role !== UserRole.STAFF) return true;
    const permission = definition.requiredPermission;
    return (
      permission === 'self-service' ||
      (permission !== undefined && subject.permissions?.[permission] === true)
    );
  });

// Mirrors the resource policies of the corresponding HTTP controllers. Unknown
// tools have no staff permission until their policy is explicitly registered.
export function resolveAiToolPermission(
  name: string,
): AuthenticatedPolicy | undefined {
  if (
    /^(get_(root|health|test_.+|auth_profile|users_profile_me)|patch_users_profile_me|post_users_profile_change_password|get_currenc.+|(?:get|patch)_notification_preferences)$/.test(
      name,
    )
  )
    return 'self-service';
  const resource = name.replace(/^(get|post|patch|put|delete)_/, '');
  const policies: ReadonlyArray<readonly [RegExp, AuthenticatedPolicy]> = [
    [/^(users|auth_|staff)/, 'users'],
    [/^currenc/, 'self-service'],
    [/^agenda/, 'self-service'],
    [/^dashboard/, 'dashboard'],
    [/^documents/, 'leases'],
    [/^(properties|property_|units|unit_)/, 'properties'],
    [/^(leases|lease_|amendment)/, 'leases'],
    [/^payment_template/, 'templates'],
    [/^(payments|payment_|tenant_account|bank_account)/, 'payments'],
    [/^(invoice|credit_note)/, 'invoices'],
    [/^tenant/, 'tenants'],
    [/^buyer/, 'self-service'],
    [/^communications/, 'communications'],
    [/^interested/, 'interested'],
    [/^owner/, 'owners'],
    [/^github_/, 'ai'],
    [/^sales/, 'sales'],
    [/^maintenance/, 'maintenance'],
    [/^settlement/, 'settlements'],
  ];
  return policies.find(([pattern]) => pattern.test(resource))?.[1];
}
