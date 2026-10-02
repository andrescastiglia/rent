import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { getUserRoles } from '../helpers/role-scope.helper';
import {
  SELF_SERVICE_ACTION_KEY,
  SELF_SERVICE_ACTIONS,
  SelfServiceActionName,
} from '../decorators/self-service-action.decorator';

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

    const roles = getUserRoles(user);
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

    // Handler-only metadata prevents a controller-level exception from granting
    // every mutation or a matching URL prefix from granting an unrelated action.
    const action = this.reflector.get<SelfServiceActionName>(
      SELF_SERVICE_ACTION_KEY,
      context.getHandler(),
    );
    if (action && Object.hasOwn(SELF_SERVICE_ACTIONS, action)) {
      const policy = SELF_SERVICE_ACTIONS[action];
      const allowedRoles: readonly UserRole[] = policy.roles;
      if (
        policy.method === method &&
        roles.some((role) => allowedRoles.includes(role))
      ) {
        return true;
      }
    }

    throw new ForbiddenException('Read-only role cannot modify resources');
  }
}
