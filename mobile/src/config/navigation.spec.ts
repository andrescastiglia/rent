import {
  canManageLeases,
  canManageOwners,
  canManageOwnersForUser,
  canManageTenants,
  canUserAccessPath,
  getLandingPathForRole,
  getLandingPathForUser,
  getNavigationForRole,
  getNavigationForUser,
} from './navigation';

describe('canManageLeases', () => {
  it('only grants lease mutations to administrators and staff', () => {
    expect(canManageLeases('admin')).toBe(true);
    expect(canManageLeases('staff')).toBe(true);
    expect(canManageLeases('owner')).toBe(false);
    expect(canManageLeases('tenant')).toBe(false);
    expect(canManageLeases('buyer')).toBe(false);
  });
});

describe('self-service mutation policy', () => {
  it.each(['admin', 'staff'])('allows %s to manage people', (role) => {
    expect(canManageTenants(role)).toBe(true);
    expect(canManageOwners(role)).toBe(true);
  });

  it.each(['owner', 'tenant', 'buyer', undefined])(
    'keeps %s out of backoffice people mutations',
    (role) => {
      expect(canManageTenants(role)).toBe(false);
      expect(canManageOwners(role)).toBe(false);
    },
  );
});

describe('buyer navigation', () => {
  it('routes buyers to AI without exposing the company dashboard', () => {
    expect(getLandingPathForRole('buyer')).toBe('/home');
    expect(getNavigationForRole('buyer').map((item) => item.href)).toEqual([
      '/sales',
      '/ai',
    ]);
    expect(canUserAccessPath({ role: 'buyer' }, '/dashboard')).toBe(false);
    expect(canUserAccessPath({ role: 'buyer' }, '/ai')).toBe(true);
  });
});

describe('multi-role navigation', () => {
  it('routes a buyer with an operational role to the task dashboard', () => {
    expect(
      getLandingPathForUser({ role: 'buyer', roles: ['buyer', 'staff'] }),
    ).toBe('/home');
  });

  it('recognizes management granted by a secondary staff role', () => {
    expect(
      canManageOwnersForUser({
        role: 'owner',
        roles: ['owner', 'staff'],
        permissions: { owners: true },
      }),
    ).toBe(true);
  });
});

describe('getNavigationForRole', () => {
  it('returns admin-only routes for admins', () => {
    const items = getNavigationForRole('admin');

    expect(items.some((item) => item.href === '/users')).toBe(true);
    expect(items.some((item) => item.href === '/properties')).toBe(true);
    expect(items.some((item) => item.href === '/sales')).toBe(true);
  });

  it('filters routes for tenants', () => {
    const items = getNavigationForRole('tenant');
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/ai');
    expect(hrefs).not.toContain('/payments');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/properties');
    expect(hrefs).not.toContain('/users');
  });
});

describe('permission-aware navigation', () => {
  it('filters staff navigation by explicit module permissions', () => {
    const items = getNavigationForUser({
      role: 'staff',
      permissions: { dashboard: true, payments: false, invoices: true },
    });
    expect(items.map((item) => item.href)).toEqual([
      '/agenda',
      '/dashboard',
      '/invoices',
    ]);
  });

  it('allows staff modules even when the base role menu omits them', () => {
    const items = getNavigationForUser({
      role: 'staff',
      permissions: { properties: true, tenants: true, leases: true },
    });

    expect(items.map((item) => item.href)).toEqual([
      '/agenda',
      '/properties',
      '/tenants',
      '/leases',
    ]);
  });

  it('denies deep links outside the role or staff module policy', () => {
    expect(
      canUserAccessPath(
        { role: 'staff', permissions: { payments: true } },
        '/payments/123',
      ),
    ).toBe(true);
    expect(
      canUserAccessPath(
        { role: 'staff', permissions: { payments: true } },
        '/users/123',
      ),
    ).toBe(false);
    expect(canUserAccessPath({ role: 'tenant' }, '/properties/123')).toBe(
      false,
    );
    expect(canUserAccessPath({ role: 'admin' }, '/users/123')).toBe(true);
    expect(
      canUserAccessPath(
        { role: 'staff', permissions: { owners: true } },
        '/owners/123/edit',
      ),
    ).toBe(true);
    expect(canUserAccessPath({ role: 'owner' }, '/sales')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/interested')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/leases/new')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/leases/l1/edit')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/leases/l1')).toBe(true);
    expect(canUserAccessPath({ role: 'owner' }, '/tenants/new')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/tenants/t1/edit')).toBe(
      false,
    );
    expect(
      canUserAccessPath({ role: 'owner' }, '/tenants/t1/payments/new'),
    ).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/owners/new')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/owners/o1/pay')).toBe(false);
    expect(canUserAccessPath({ role: 'owner' }, '/owners/o1/edit')).toBe(false);
    expect(canUserAccessPath({ role: 'tenant' }, '/payments')).toBe(false);
    expect(canUserAccessPath({ role: 'tenant' }, '/invoices/i1')).toBe(false);
    expect(canUserAccessPath({ role: 'tenant' }, '/unknown')).toBe(false);
  });
});

it('does not let a secondary external role bypass staff mutation permissions', () => {
  const user = { role: 'owner', roles: ['owner', 'staff'], permissions: {} };
  expect(canUserAccessPath(user, '/owners/new')).toBe(false);
  expect(canManageOwnersForUser(user)).toBe(false);
  expect(
    canUserAccessPath(
      { ...user, permissions: { owners: true } },
      '/owners/new',
    ),
  ).toBe(true);
});

it('shares the agenda with staff without widening financial or proposal permissions', () => {
  expect(
    canUserAccessPath(
      { role: 'staff', permissions: {} },
      '/agenda/task:example',
    ),
  ).toBe(true);
  expect(
    canUserAccessPath({ role: 'staff', permissions: {} }, '/agenda/proposals'),
  ).toBe(false);
  expect(
    canUserAccessPath({ role: 'staff', permissions: {} }, '/invoices/example'),
  ).toBe(false);
  expect(canUserAccessPath({ role: 'tenant' }, '/agenda')).toBe(false);
});
