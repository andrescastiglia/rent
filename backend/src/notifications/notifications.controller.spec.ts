import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const notificationsService = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  let controller: NotificationsController;
  const req = {
    user: { id: 'u1', email: 'user@test.dev', companyId: 'c1', role: 'admin' },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationsController(notificationsService as any);
  });

  it('getMyPreferences delegates to notificationsService.getPreferences', async () => {
    notificationsService.getPreferences.mockResolvedValue({
      emailEnabled: true,
    });
    await expect(controller.getMyPreferences(req)).resolves.toEqual({
      emailEnabled: true,
    });
    expect(notificationsService.getPreferences).toHaveBeenCalledWith(
      'u1',
      'c1',
    );
  });

  it('updateMyPreferences delegates to notificationsService.updatePreferences', async () => {
    notificationsService.updatePreferences.mockResolvedValue({
      emailEnabled: false,
    });
    const dto = { emailEnabled: false } as any;
    await expect(controller.updateMyPreferences(req, dto)).resolves.toEqual({
      emailEnabled: false,
    });
    expect(notificationsService.updatePreferences).toHaveBeenCalledWith(
      'u1',
      'c1',
      dto,
    );
  });

  it('getUserPreferences delegates to notificationsService.getPreferences with given userId', async () => {
    notificationsService.getPreferences.mockResolvedValue({
      emailEnabled: true,
    });
    await expect(
      controller.getUserPreferences('other-user-id', req),
    ).resolves.toEqual({ emailEnabled: true });
    expect(notificationsService.getPreferences).toHaveBeenCalledWith(
      'other-user-id',
      'c1',
    );
  });
});
