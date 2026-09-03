import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AUTHENTICATED_KEY,
  AuthenticatedPolicy,
} from '../decorators/authenticated.decorator';
import {
  UserModulePermissionKey,
  UserModulePermissions,
  UserRole,
} from '../../users/entities/user.entity';

const STAFF_RESOURCE_ROUTES: ReadonlyArray<
  readonly [pathPrefix: string, resource: UserModulePermissionKey]
> = [
  ['/dashboard', 'dashboard'],
  ['/properties', 'properties'],
  ['/owners', 'owners'],
  ['/interested', 'interested'],
  ['/tenants', 'tenants'],
  ['/leases', 'leases'],
  ['/contracts', 'leases'],
  ['/payments/document-templates', 'templates'],
  ['/payment-templates', 'templates'],
  ['/payments', 'payments'],
  ['/tenant-accounts', 'payments'],
  ['/invoices', 'invoices'],
  ['/buyers', 'sales'],
  ['/sales', 'sales'],
  ['/reports', 'reports'],
  ['/users', 'users'],
  ['/templates', 'templates'],
  ['/maintenance', 'maintenance'],
  ['/communications', 'communications'],
  ['/bank-reconciliation', 'reconciliation'],
  ['/settlements', 'settlements'],
  ['/pending-actions', 'approvals'],
  ['/ai', 'ai'],
];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private resolveStaffResource(
    pathname: string,
  ): UserModulePermissionKey | null {
    const path = pathname.toLowerCase();
    return (
      STAFF_RESOURCE_ROUTES.find(([prefix]) => path.startsWith(prefix))?.[1] ??
      null
    );
  }

  private staffHasAccess(
    path: string,
    permissions: UserModulePermissions | undefined,
    declaredResource?: UserModulePermissionKey,
  ): boolean {
    const resource = declaredResource ?? this.resolveStaffResource(path);
    if (!resource) {
      return false;
    }

    if (!permissions || Object.keys(permissions).length === 0) {
      return false;
    }

    return permissions[resource] === true;
  }

  private canAccessAuthenticatedRoute(
    user:
      | {
          role: UserRole;
          roles?: UserRole[];
          permissions?: UserModulePermissions;
        }
      | undefined,
    path: string,
    policy: AuthenticatedPolicy | undefined,
  ): boolean {
    if (!policy || !user) return false;
    const roles = this.getRoles(user);
    if (
      policy === 'self-service' ||
      roles.some((role) => role !== UserRole.STAFF)
    ) {
      return true;
    }
    return this.staffHasAccess(path, user.permissions, policy);
  }

  private getRoles(user: { role: UserRole; roles?: UserRole[] }): UserRole[] {
    return user.roles?.length ? user.roles : [user.role];
  }

  private canStaffAccessRoleProtectedRoute(
    requiredRoles: UserRole[],
    path: string,
    permissions: UserModulePermissions | undefined,
    policy: AuthenticatedPolicy | undefined,
  ): boolean {
    const hasDirectRole = requiredRoles.includes(UserRole.STAFF);
    const inheritsAdmin =
      requiredRoles.includes(UserRole.ADMIN) && !path.startsWith('/users');
    if (!hasDirectRole && !inheritsAdmin) return false;

    return this.staffHasAccess(
      path,
      permissions,
      policy === 'self-service' ? undefined : policy,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    // Check if endpoint is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    const path = String(request.path ?? request.originalUrl ?? '');

    const authenticatedPolicy =
      this.reflector.getAllAndOverride<AuthenticatedPolicy>(AUTHENTICATED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return this.canAccessAuthenticatedRoute(user, path, authenticatedPolicy);
    }

    if (!user) {
      return false;
    }

    const userRoles = this.getRoles(user);
    const hasDirectRole = userRoles.some(
      (role) => role !== UserRole.STAFF && requiredRoles.includes(role),
    );
    if (hasDirectRole) {
      return true;
    }

    if (userRoles.includes(UserRole.STAFF)) {
      return this.canStaffAccessRoleProtectedRoute(
        requiredRoles,
        path,
        user.permissions,
        authenticatedPolicy,
      );
    }

    // Check if user has one of the required roles
    return userRoles.some((role) => requiredRoles.includes(role));
  }
}
