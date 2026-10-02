import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AUTHENTICATED_KEY,
  AuthenticatedPolicy,
} from '../decorators/authenticated.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

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

  const setPolicy = ({
    isPublic = false,
    authenticated,
    roles,
  }: {
    isPublic?: boolean;
    authenticated?: AuthenticatedPolicy;
    roles?: UserRole[];
  }) => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => {
        if (key === IS_PUBLIC_KEY) return isPublic;
        if (key === AUTHENTICATED_KEY) return authenticated;
        if (key === ROLES_KEY) return roles;
        return undefined;
      },
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([false, true])(
    'does not let an external role bypass staff module permissions (role-protected=%s)',
    (roleProtected) => {
      const guard = new RolesGuard(reflector);
      setPolicy({
        authenticated: 'maintenance',
        roles: roleProtected
          ? [UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER]
          : undefined,
      });
      const user = {
        role: UserRole.OWNER,
        roles: [UserRole.OWNER, UserRole.STAFF],
        permissions: { maintenance: false },
      };
      expect(
        guard.canActivate(makeContext({ path: '/maintenance/tickets', user })),
      ).toBe(false);
      user.permissions.maintenance = true;
      expect(
        guard.canActivate(makeContext({ path: '/maintenance/tickets', user })),
      ).toBe(true);
    },
  );

  it('preserves external multirole and administrator access without staff inheritance', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({
      authenticated: 'leases',
      roles: [UserRole.ADMIN, UserRole.OWNER],
    });
    expect(
      guard.canActivate(
        makeContext({
          path: '/amendments',
          user: {
            role: UserRole.TENANT,
            roles: [UserRole.TENANT, UserRole.OWNER],
          },
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext({
          path: '/amendments',
          user: {
            role: UserRole.STAFF,
            roles: [UserRole.STAFF, UserRole.ADMIN],
            permissions: {},
          },
        }),
      ),
    ).toBe(true);
  });

  it('allows public routes without a user', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ isPublic: true });
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('denies routes without an explicit authorization policy', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({});
    expect(
      guard.canActivate(makeContext({ user: { role: UserRole.ADMIN } })),
    ).toBe(false);
  });

  it('requires a user for authenticated and role-protected routes', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ authenticated: 'self-service' });
    expect(guard.canActivate(makeContext({}))).toBe(false);

    setPolicy({ roles: [UserRole.ADMIN] });
    expect(guard.canActivate(makeContext({}))).toBe(false);
  });

  it('allows authenticated self-service without staff module permissions', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ authenticated: 'self-service' });
    expect(
      guard.canActivate(
        makeContext({
          path: '/users/profile/me',
          user: { role: UserRole.STAFF, permissions: {} },
        }),
      ),
    ).toBe(true);
  });

  it('enforces the declared module on authenticated staff routes', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ authenticated: 'properties' });
    expect(
      guard.canActivate(
        makeContext({
          path: '/units',
          user: { role: UserRole.STAFF, permissions: { properties: true } },
        }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        makeContext({
          path: '/units',
          user: { role: UserRole.STAFF, permissions: { properties: false } },
        }),
      ),
    ).toBe(false);
  });

  it('grants staff admin inheritance except on /users', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ roles: [UserRole.ADMIN] });
    expect(
      guard.canActivate(
        makeContext({
          path: '/dashboard/stats',
          user: { role: UserRole.STAFF, permissions: { dashboard: true } },
        }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        makeContext({
          path: '/users',
          user: { role: UserRole.STAFF, permissions: { users: true } },
        }),
      ),
    ).toBe(false);
  });

  it('restricts staff role access by module permissions', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ roles: [UserRole.ADMIN, UserRole.STAFF] });
    expect(
      guard.canActivate(
        makeContext({
          path: '/payments',
          user: { role: UserRole.STAFF, permissions: { payments: false } },
        }),
      ),
    ).toBe(false);

    expect(
      guard.canActivate(
        makeContext({
          path: '/payments',
          user: { role: UserRole.STAFF, permissions: {} },
        }),
      ),
    ).toBe(false);

    expect(
      guard.canActivate(
        makeContext({
          path: '/unmapped-resource',
          user: { role: UserRole.STAFF, permissions: { dashboard: true } },
        }),
      ),
    ).toBe(false);

    expect(
      guard.canActivate(
        makeContext({
          path: '/leases',
          user: { role: UserRole.STAFF, permissions: { leases: true } },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['/dashboard/stats', 'dashboard'],
    ['/properties', 'properties'],
    ['/owners', 'owners'],
    ['/interested', 'interested'],
    ['/tenants', 'tenants'],
    ['/leases', 'leases'],
    ['/payment-templates', 'templates'],
    ['/payments', 'payments'],
    ['/tenant-accounts/account-1', 'payments'],
    ['/invoices', 'invoices'],
    ['/buyers', 'sales'],
    ['/reports', 'reports'],
    ['/maintenance/tickets', 'maintenance'],
    ['/communications/templates', 'communications'],
    ['/bank-reconciliation/alerts', 'reconciliation'],
    ['/settlements', 'settlements'],
    ['/pending-actions', 'approvals'],
    ['/ai/respond', 'ai'],
  ])('applies staff permission A/B for %s', (path, permission) => {
    const guard = new RolesGuard(reflector);
    setPolicy({ roles: [UserRole.ADMIN, UserRole.STAFF] });

    expect(
      guard.canActivate(
        makeContext({
          path,
          user: { role: UserRole.STAFF, permissions: { [permission]: true } },
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext({
          path,
          user: { role: UserRole.STAFF, permissions: { [permission]: false } },
        }),
      ),
    ).toBe(false);
  });

  it('rejects a role that is not explicitly allowed', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ roles: [UserRole.ADMIN] });
    expect(
      guard.canActivate(makeContext({ user: { role: UserRole.OWNER } })),
    ).toBe(false);
  });

  it('accepts any directly allowed role from a multi-role identity', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ roles: [UserRole.TENANT] });
    expect(
      guard.canActivate(
        makeContext({
          user: {
            role: UserRole.OWNER,
            roles: [UserRole.OWNER, UserRole.TENANT],
          },
        }),
      ),
    ).toBe(true);
  });

  it('applies staff permissions when staff is a secondary role', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ roles: [UserRole.ADMIN, UserRole.STAFF] });
    expect(
      guard.canActivate(
        makeContext({
          path: '/contracts',
          user: {
            role: UserRole.OWNER,
            roles: [UserRole.OWNER, UserRole.STAFF],
            permissions: { leases: true },
          },
        }),
      ),
    ).toBe(true);
  });

  it('requires the staff capability when an external identity also has a staff role', () => {
    const guard = new RolesGuard(reflector);
    setPolicy({ authenticated: 'leases' });
    expect(
      guard.canActivate(
        makeContext({
          path: '/contracts',
          user: {
            role: UserRole.OWNER,
            roles: [UserRole.OWNER, UserRole.STAFF],
            permissions: { leases: false },
          },
        }),
      ),
    ).toBe(false);
  });
});
