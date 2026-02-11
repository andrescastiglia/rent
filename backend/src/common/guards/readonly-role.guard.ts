import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class ReadonlyRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole } | undefined;
    if (!user?.role) {
      return true;
    }

    if (user.role !== UserRole.OWNER && user.role !== UserRole.TENANT) {
      return true;
    }

    const method = String(request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const path = String(request.path ?? request.originalUrl ?? '');

    // Owner/tenant can still manage own profile data and credentials.
    const isAllowedProfileMutation =
      (method === 'PATCH' && path.startsWith('/users/profile/me')) ||
      (method === 'POST' && path.startsWith('/users/profile/change-password'));
    if (isAllowedProfileMutation) {
      return true;
    }

    throw new ForbiddenException('Read-only role cannot modify resources');
  }
}
