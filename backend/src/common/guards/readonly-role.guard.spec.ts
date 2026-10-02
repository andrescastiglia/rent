import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReadonlyRoleGuard } from './readonly-role.guard';
import { UserRole } from '../../users/entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  SELF_SERVICE_ACTION_KEY,
  SELF_SERVICE_ACTIONS,
  SelfServiceActionName,
} from '../decorators/self-service-action.decorator';

describe('ReadonlyRoleGuard', () => {
  const guard = new ReadonlyRoleGuard(new Reflector());
  const externalRoles = [UserRole.OWNER, UserRole.TENANT, UserRole.BUYER];

  const makeContext = (
    request: Record<string, unknown>,
    action?: string,
    classAction?: string,
    isPublic = false,
  ): ExecutionContext => {
    const handler = () => undefined;
    class TestController {}
    if (action)
      Reflect.defineMetadata(SELF_SERVICE_ACTION_KEY, action, handler);
    if (classAction)
      Reflect.defineMetadata(
        SELF_SERVICE_ACTION_KEY,
        classAction,
        TestController,
      );
    if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  it('leaves public endpoints, authentication and internal authorization to their guards', () => {
    expect(guard.canActivate(makeContext({}, undefined, undefined, true))).toBe(
      true,
    );
    expect(guard.canActivate(makeContext({ method: 'POST' }))).toBe(true);
    for (const role of [UserRole.ADMIN, UserRole.STAFF]) {
      expect(
        guard.canActivate(makeContext({ method: 'POST', user: { role } })),
      ).toBe(true);
    }
    expect(
      guard.canActivate(
        makeContext({ method: 'POST', user: { role: 'unknown' } }),
      ),
    ).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'allows external users to perform %s reads',
    (method) => {
      for (const role of externalRoles) {
        expect(guard.canActivate(makeContext({ method, user: { role } }))).toBe(
          true,
        );
      }
    },
  );

  it.each(Object.keys(SELF_SERVICE_ACTIONS) as SelfServiceActionName[])(
    'permits only the explicitly declared roles and method for %s',
    (action) => {
      const policy = SELF_SERVICE_ACTIONS[action];
      const allowedRoles: readonly UserRole[] = policy.roles;
      for (const role of externalRoles) {
        const context = makeContext(
          { method: policy.method, user: { role } },
          action,
        );
        if (allowedRoles.includes(role))
          expect(guard.canActivate(context)).toBe(true);
        else
          expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      }
      expect(() =>
        guard.canActivate(
          makeContext(
            { method: 'DELETE', user: { role: policy.roles[0] } },
            action,
          ),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it.each([
    '/users/profile/me',
    '/users/profile/me/privileged',
    '/users/profile/change-password/other-user',
    '/ai/respond',
    '/ai/respond/execute',
    '/ai/tools/respond',
    '/maintenance/tickets',
    '/payments',
  ])('does not authorize an undecorated mutation by its URL (%s)', (path) => {
    expect(() =>
      guard.canActivate(
        makeContext({ method: 'POST', path, user: { role: UserRole.OWNER } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('ignores controller-wide grants and unknown actions', () => {
    const request = { method: 'POST', user: { role: UserRole.OWNER } };
    expect(() =>
      guard.canActivate(makeContext(request, undefined, 'maintenance.request')),
    ).toThrow(ForbiddenException);
    for (const action of ['unknown', '__proto__']) {
      expect(() => guard.canActivate(makeContext(request, action))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('supports external multirole identities without relying on the primary role', () => {
    expect(
      guard.canActivate(
        makeContext(
          {
            method: 'PATCH',
            user: {
              role: UserRole.TENANT,
              roles: [UserRole.TENANT, UserRole.OWNER],
            },
          },
          'amendment.submit',
        ),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        makeContext(
          {
            method: 'PATCH',
            user: { role: UserRole.OWNER, roles: [UserRole.TENANT] },
          },
          'amendment.submit',
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('leaves internal multirole module permissions to RolesGuard', () => {
    expect(
      guard.canActivate(
        makeContext({
          method: 'POST',
          user: {
            role: UserRole.OWNER,
            roles: [UserRole.OWNER, UserRole.STAFF],
          },
        }),
      ),
    ).toBe(true);
  });
});
