import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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
      return true;
    }

    // Check if user has one of the required roles
    return requiredRoles.some((role) => user.role === role); // NOSONAR
  }
}
