import {
  authenticatedWebUrl,
  getWebCapabilities,
} from './channel-capabilities';
afterEach(() => {
  delete process.env.EXPO_PUBLIC_WEB_URL;
});
it('provides owner and tenant alternatives without exposing internal proposals', () => {
  expect(getWebCapabilities({ role: 'owner' }).map((item) => item.id)).toEqual([
    'ownerSummary',
    'ownerMaintenance',
    'ownerSettlements',
  ]);
  expect(getWebCapabilities({ role: 'tenant' }).map((item) => item.id)).toEqual(
    ['tenantAccount', 'tenantMaintenance'],
  );
});
it('requires staff module permission for operational alternatives', () => {
  expect(getWebCapabilities({ role: 'staff', permissions: {} })).toEqual([]);
  expect(
    getWebCapabilities({ role: 'staff', permissions: { sales: true } }).map(
      (item) => item.id,
    ),
  ).toEqual(['salesInstallments']);
  expect(
    getWebCapabilities({
      role: 'staff',
      permissions: { ai: true, dashboard: true },
    }).map((item) => item.webPath),
  ).toContain('/dashboard#pending-actions');
});
it('builds locale-aware application links without putting access tokens in the URL', () => {
  process.env.EXPO_PUBLIC_WEB_URL = 'https://rent.example/';
  expect(authenticatedWebUrl('/dashboard#pending-actions', 'en')).toBe(
    'https://rent.example/en/dashboard#pending-actions',
  );
  expect(authenticatedWebUrl('/sales', 'unknown')).toBe(
    'https://rent.example/es/sales',
  );
});
it.each(['https://elsewhere.test', '//elsewhere.test'])(
  'rejects untrusted alternative paths %s',
  (path) => {
    expect(() => authenticatedWebUrl(path)).toThrow('Invalid application path');
  },
);
