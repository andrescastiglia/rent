import {
  canUserAccessPath,
  getNavigationForRole,
  getNavigationForUser,
} from './navigation';

describe('getNavigationForRole', () => {
  it('returns admin-only routes for admins', () => {
    const items = getNavigationForRole('admin');

    expect(items.some((item) => item.href === '/users')).toBe(true);
    expect(items.some((item) => item.href === '/properties')).toBe(true);
  });

  it('filters routes for tenants', () => {
    const items = getNavigationForRole('tenant');
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/payments');
    expect(hrefs).toContain('/ai');
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
    expect(items.map((item) => item.href)).toEqual(['/dashboard', '/invoices']);
  });

  it('allows staff modules even when the base role menu omits them', () => {
    const items = getNavigationForUser({
      role: 'staff',
      permissions: { properties: true, tenants: true, leases: true },
    });

    expect(items.map((item) => item.href)).toEqual([
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
    expect(canUserAccessPath({ role: 'owner' }, '/sales')).toBe(true);
    expect(canUserAccessPath({ role: 'tenant' }, '/unknown')).toBe(false);
  });
});
