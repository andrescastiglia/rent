import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  const adminsRepository = {
    findOne: jest.fn(),
  };
  let service: PermissionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PermissionsService(adminsRepository as any);
  });

  it('returns admin by user id', async () => {
    adminsRepository.findOne.mockResolvedValue({ id: 'a1' });
    await expect(service.getAdminByUserId('u1')).resolves.toEqual({ id: 'a1' });
  });

  it('isSuperAdmin returns false for non-admin and true for super admin', async () => {
    await expect(
      service.isSuperAdmin({ id: 'u1', role: 'owner' } as any),
    ).resolves.toBe(false);

    adminsRepository.findOne.mockResolvedValue({ isSuperAdmin: true });
    await expect(
      service.isSuperAdmin({ id: 'u2', role: 'admin' } as any),
    ).resolves.toBe(true);
  });

  it('hasPermission handles missing admin/resource and granular checks', async () => {
    await expect(
      service.hasPermission(
        { id: 'u1', role: 'owner' } as any,
        'leases',
        'read',
      ),
    ).resolves.toBe(false);

    adminsRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.hasPermission(
        { id: 'u2', role: 'admin' } as any,
        'leases',
        'read',
      ),
    ).resolves.toBe(false);

    adminsRepository.findOne.mockResolvedValueOnce({
      isSuperAdmin: false,
      permissions: {},
    });
    await expect(
      service.hasPermission(
        { id: 'u2', role: 'admin' } as any,
        'leases',
        'read',
      ),
    ).resolves.toBe(false);

    adminsRepository.findOne.mockResolvedValueOnce({
      isSuperAdmin: false,
      permissions: { leases: { read: true, write: false } },
    });
    await expect(
      service.hasPermission(
        { id: 'u2', role: 'admin' } as any,
        'leases',
        'read',
      ),
    ).resolves.toBe(true);
  });

  it('hasAnyPermission and hasAllPermissions evaluate lists correctly', async () => {
    const user = { id: 'u1', role: 'admin' } as any;
    adminsRepository.findOne.mockResolvedValue({
      isSuperAdmin: false,
      permissions: { leases: { read: true }, invoices: { read: false } },
    });

    await expect(
      service.hasAnyPermission(user, [
        { resource: 'invoices', action: 'read' },
        { resource: 'leases', action: 'read' },
      ]),
    ).resolves.toBe(true);

    await expect(
      service.hasAllPermissions(user, [
        { resource: 'leases', action: 'read' },
        { resource: 'invoices', action: 'read' },
      ]),
    ).resolves.toBe(false);
  });

  it('super admin has all permissions', async () => {
    adminsRepository.findOne.mockResolvedValue({ isSuperAdmin: true });
    await expect(
      service.hasPermission({ id: 'u1', role: 'admin' } as any, 'x', 'y'),
    ).resolves.toBe(true);
  });
});
