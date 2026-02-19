import { UsersController } from './users.controller';

describe('UsersController', () => {
  const usersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
    findOneById: jest.fn(),
    update: jest.fn(),
    setActivation: jest.fn(),
    resetPassword: jest.fn(),
    remove: jest.fn(),
  };

  const i18n = {
    t: jest.fn(async (key: string) => key),
  } as any;

  let controller: UsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(usersService as any);
  });

  it('create strips passwordHash from response', async () => {
    usersService.create.mockResolvedValue({
      id: 'u1',
      email: 'x@y.com',
      passwordHash: 'secret',
    });

    const result = await controller.create({ email: 'x@y.com' } as any);
    expect(result).toEqual({ id: 'u1', email: 'x@y.com' });
  });

  it('findAll strips passwordHash from listed users', async () => {
    usersService.findAll.mockResolvedValue({
      data: [
        { id: 'u1', passwordHash: 'a' },
        { id: 'u2', passwordHash: 'b' },
      ],
      total: 2,
      page: 1,
      limit: 10,
    });

    const result = await controller.findAll({ page: 1, limit: 10 } as any);
    expect(result.data).toEqual([{ id: 'u1' }, { id: 'u2' }]);
  });

  it('getProfile returns authenticated user', () => {
    expect(controller.getProfile({ user: { id: 'me' } } as any)).toEqual({
      id: 'me',
    });
  });

  it('updateProfile strips password hash', async () => {
    usersService.updateProfile.mockResolvedValue({
      id: 'u1',
      passwordHash: 'secret',
      firstName: 'Ana',
    });

    const result = await controller.updateProfile(
      { user: { id: 'u1' } } as any,
      { firstName: 'Ana' } as any,
    );

    expect(result).toEqual({ id: 'u1', firstName: 'Ana' });
  });

  it('changePassword delegates to service and returns translated message', async () => {
    const result = await controller.changePassword(
      { user: { id: 'u1' } } as any,
      { currentPassword: 'old', newPassword: 'new' } as any,
      i18n,
    );

    expect(usersService.changePassword).toHaveBeenCalledWith(
      'u1',
      'old',
      'new',
    );
    expect(result).toEqual({ message: 'user.passwordChanged' });
  });

  it('findOne returns null when not found', async () => {
    usersService.findOneById.mockResolvedValue(null);
    await expect(controller.findOne('missing')).resolves.toBeNull();
  });

  it('findOne strips password hash when found', async () => {
    usersService.findOneById.mockResolvedValue({
      id: 'u1',
      passwordHash: 'secret',
      email: 'x@y.com',
    });
    await expect(controller.findOne('u1')).resolves.toEqual({
      id: 'u1',
      email: 'x@y.com',
    });
  });

  it('update and setActivation strip password hash', async () => {
    usersService.update.mockResolvedValue({
      id: 'u1',
      passwordHash: 'secret',
      firstName: 'A',
    });
    usersService.setActivation.mockResolvedValue({
      id: 'u1',
      passwordHash: 'secret',
      isActive: true,
    });

    await expect(
      controller.update('u1', { firstName: 'A' } as any),
    ).resolves.toEqual({
      id: 'u1',
      firstName: 'A',
    });
    await expect(
      controller.setActivation('u1', { isActive: true } as any),
    ).resolves.toEqual({ id: 'u1', isActive: true });
  });

  it('resetPassword and remove return translated messages', async () => {
    usersService.resetPassword.mockResolvedValue({
      temporaryPassword: 'tmp12345',
    });

    const reset = await controller.resetPassword(
      'u1',
      { newPassword: '' } as any,
      i18n,
    );
    expect(reset).toEqual({
      message: 'user.passwordChanged',
      temporaryPassword: 'tmp12345',
    });

    const removed = await controller.remove('u1', i18n);
    expect(usersService.remove).toHaveBeenCalledWith('u1');
    expect(removed).toEqual({ message: 'user.deleted' });
  });
});
