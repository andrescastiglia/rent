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

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private resolveStaffResource(
    pathname: string,
  ): UserModulePermissionKey | null {
    const path = pathname.toLowerCase();

    if (path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/properties')) return 'properties';
    if (path.startsWith('/owners')) return 'owners';
    if (path.startsWith('/interested')) return 'interested';
    if (path.startsWith('/tenants')) return 'tenants';
    if (path.startsWith('/leases')) return 'leases';
    if (path.startsWith('/payments/document-templates')) return 'templates';
    if (path.startsWith('/payments')) return 'payments';
    if (path.startsWith('/invoices')) return 'invoices';
    if (path.startsWith('/buyers')) return 'sales';
    if (path.startsWith('/sales')) return 'sales';
    if (path.startsWith('/reports')) return 'reports';
    if (path.startsWith('/users')) return 'users';
    if (path.startsWith('/templates')) return 'templates';

    return null;
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
      if (!authenticatedPolicy || !user) {
        return false;
      }
      if (user.role === UserRole.STAFF) {
        if (authenticatedPolicy === 'self-service') {
          return true;
        }
        return this.staffHasAccess(
          String(request.path ?? request.originalUrl ?? ''),
          user.permissions,
          authenticatedPolicy,
        );
      }
      return true;
    }

    if (!user) {
      return false;
    }

    // Staff inherits admin access except for user administration endpoints.
    if (
      user.role === UserRole.STAFF &&
      requiredRoles.includes(UserRole.ADMIN) &&
      !String(request.path ?? request.originalUrl ?? '').startsWith('/users')
    ) {
      return this.staffHasAccess(
        String(request.path ?? request.originalUrl ?? ''),
        user.permissions,
        authenticatedPolicy !== 'self-service'
          ? authenticatedPolicy
          : undefined,
      );
    }

    // Check if user has one of the required roles
    if (!requiredRoles.includes(user.role)) {
      return false;
    }

    if (user.role === UserRole.STAFF) {
      return this.staffHasAccess(
        String(request.path ?? request.originalUrl ?? ''),
        user.permissions,
        authenticatedPolicy !== 'self-service'
          ? authenticatedPolicy
          : undefined,
      );
    }

    return true;
  }
}
