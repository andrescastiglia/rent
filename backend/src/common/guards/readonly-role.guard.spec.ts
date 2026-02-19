import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReadonlyRoleGuard } from './readonly-role.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('ReadonlyRoleGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const makeContext = (req: any) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows public and non-owner/tenant users', () => {
    const guard = new ReadonlyRoleGuard(reflector);
    reflector.getAllAndOverride = jest.fn().mockReturnValueOnce(true);
    expect(guard.canActivate(makeContext({}))).toBe(true);

    reflector.getAllAndOverride = jest.fn().mockReturnValueOnce(false);
    expect(
      guard.canActivate(
        makeContext({ method: 'POST', user: { role: UserRole.ADMIN } }),
      ),
    ).toBe(true);
  });

  it('allows read-only HTTP methods for owner/tenant', () => {
    const guard = new ReadonlyRoleGuard(reflector);
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    expect(
      guard.canActivate(
        makeContext({ method: 'GET', user: { role: UserRole.OWNER } }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext({ method: 'HEAD', user: { role: UserRole.TENANT } }),
      ),
    ).toBe(true);
  });

  it('allows owner/tenant profile mutations and blocks other writes', () => {
    const guard = new ReadonlyRoleGuard(reflector);
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    expect(
      guard.canActivate(
        makeContext({
          method: 'PATCH',
          path: '/users/profile/me',
          user: { role: UserRole.OWNER },
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext({
          method: 'POST',
          path: '/users/profile/change-password',
          user: { role: UserRole.TENANT },
        }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        makeContext({
          method: 'POST',
          path: '/payments',
          user: { role: UserRole.OWNER },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
