import { getNavigationForRole } from './navigation';

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
