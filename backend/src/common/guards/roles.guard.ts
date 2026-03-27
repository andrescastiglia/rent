import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
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
  ): boolean {
    const resource = this.resolveStaffResource(path);
    if (!resource) {
      return true;
    }

    // Backward compatibility for existing staff users: no permissions means full
    // staff access until the admin explicitly narrows it down.
    if (!permissions || Object.keys(permissions).length === 0) {
      return true;
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

    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles specified, allow access (authenticated users only)
    if (!requiredRoles) {
      return true;
    }

    // Get user from request (injected by JwtStrategy)
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    // If no user found, allow the request to proceed
    // The AuthGuard at controller level will handle authentication
    if (!user) {
      return true;
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
      );
    }

    return true;
  }
}
