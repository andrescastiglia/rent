import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const permissionsService = {
    hasAllPermissions: jest.fn(),
  };
  const makeContext = (req: any) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows public or no-required-permissions routes', async () => {
    const guard = new PermissionsGuard(reflector, permissionsService as any);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce([]);
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([]);
    await expect(
      guard.canActivate(makeContext({ user: { id: 'u1' } })),
    ).resolves.toBe(true);
  });

  it('allows when user missing and delegates permission check otherwise', async () => {
    const guard = new PermissionsGuard(reflector, permissionsService as any);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['payments:read']);
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);

    permissionsService.hasAllPermissions.mockReturnValueOnce(false);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['payments:read']);
    await expect(
      guard.canActivate(makeContext({ user: { id: 'u1' } })),
    ).resolves.toBe(false);
    expect(permissionsService.hasAllPermissions).toHaveBeenCalledWith(
      { id: 'u1' },
      ['payments:read'],
    );
  });
});
