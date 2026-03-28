import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('RolesGuard', () => {
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

  it('allows public routes and routes without roles', () => {
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(null);
    expect(guard.canActivate(makeContext({}))).toBe(true);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);
    expect(
      guard.canActivate(makeContext({ user: { role: UserRole.ADMIN } })),
    ).toBe(true);
  });

  it('allows when no user and evaluates role checks when user exists', () => {
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN]);
    expect(guard.canActivate(makeContext({}))).toBe(true);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN]);
    expect(
      guard.canActivate(makeContext({ user: { role: UserRole.OWNER } })),
    ).toBe(false);
  });

  it('grants staff admin inheritance except /users path', () => {
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN]);
    expect(
      guard.canActivate(
        makeContext({
          path: '/dashboard/stats',
          user: { role: UserRole.STAFF, permissions: { dashboard: true } },
        }),
      ),
    ).toBe(true);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN]);
    expect(
      guard.canActivate(
        makeContext({
          path: '/users',
          user: { role: UserRole.STAFF, permissions: { users: false } },
        }),
      ),
    ).toBe(false);
  });

  it('restricts staff access by module permissions', () => {
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN, UserRole.STAFF]);

    expect(
      guard.canActivate(
        makeContext({
          path: '/payments',
          user: { role: UserRole.STAFF, permissions: { payments: false } },
        }),
      ),
    ).toBe(false);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN, UserRole.STAFF]);

    expect(
      guard.canActivate(
        makeContext({
          path: '/leases',
          user: { role: UserRole.STAFF, permissions: { leases: true } },
        }),
      ),
    ).toBe(true);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([UserRole.ADMIN, UserRole.STAFF]);

    expect(
      guard.canActivate(
        makeContext({
          path: '/buyers',
          user: { role: UserRole.STAFF, permissions: { sales: false } },
        }),
      ),
    ).toBe(false);
  });
});
