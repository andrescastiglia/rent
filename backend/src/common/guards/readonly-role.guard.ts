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
    const user = request.user as
      { role?: UserRole; roles?: UserRole[] } | undefined;
    if (!user?.role) {
      return true;
    }

    const roles = user.roles?.length ? user.roles : [user.role];
    if (roles.includes(UserRole.ADMIN) || roles.includes(UserRole.STAFF)) {
      return true;
    }
    if (
      !roles.some((role) =>
        [UserRole.OWNER, UserRole.TENANT, UserRole.BUYER].includes(role),
      )
    ) {
      return true;
    }

    const method = String(request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const path = String(request.path ?? request.originalUrl ?? '');

    // Chat requests are POST because they carry a prompt, but owner/tenant
    // mutations are rejected by the AI orchestrator before tool execution.
    const isAllowedAiRead =
      method === 'POST' &&
      (path.startsWith('/ai/respond') || path.startsWith('/ai/tools/respond'));
    if (isAllowedAiRead) {
      return true;
    }

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
