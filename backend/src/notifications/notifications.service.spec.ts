import { NotificationsService } from './notifications.service';
import {
  NotificationFrequency,
  NotificationPreference,
  NotificationType,
} from './entities/notification-preference.entity';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

describe('NotificationsService', () => {
  const preferencesRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(preferencesRepo as any);
  });

  describe('getPreferences', () => {
    it('returns existing preferences when they exist', async () => {
      const existing: Partial<NotificationPreference>[] = [
        {
          id: 'pref-1',
          userId: 'user-1',
          companyId: 'co-1',
          notificationType: NotificationType.INVOICE_ISSUED,
          channel: 'whatsapp',
          frequency: NotificationFrequency.IMMEDIATE,
          isEnabled: true,
        },
      ];
      preferencesRepo.find.mockResolvedValue(existing);

      const result = await service.getPreferences('user-1', 'co-1');

      expect(preferencesRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', companyId: 'co-1' },
        order: { notificationType: 'ASC' },
      });
      expect(result).toEqual(existing);
      expect(preferencesRepo.save).not.toHaveBeenCalled();
    });

    it('seeds default preferences when none exist', async () => {
      preferencesRepo.find.mockResolvedValue([]);
      const defaults = service.getDefaultPreferences();
      const created = defaults.map((d) => ({
        ...d,
        userId: 'user-1',
        companyId: 'co-1',
      }));
      preferencesRepo.create.mockImplementation((data: unknown) => data);
      preferencesRepo.save.mockResolvedValue(created);
      // Second call after seeding
      preferencesRepo.find.mockResolvedValueOnce([]).mockResolvedValue(created);

      const result = await service.getPreferences('user-1', 'co-1');

      expect(preferencesRepo.create).toHaveBeenCalledTimes(
        Object.values(NotificationType).length,
      );
      expect(preferencesRepo.save).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('getDefaultPreferences covers all notification types', () => {
      const defaults = service.getDefaultPreferences();
      const types = Object.values(NotificationType);

      expect(defaults).toHaveLength(types.length);
      for (const type of types) {
        expect(defaults.find((d) => d.notificationType === type)).toBeDefined();
      }
      for (const d of defaults) {
        expect(d.channel).toBe('whatsapp');
        expect(d.frequency).toBe(NotificationFrequency.IMMEDIATE);
        expect(d.isEnabled).toBe(true);
      }
    });
  });

  describe('updatePreferences', () => {
    it('updates an existing preference', async () => {
      const existing: Partial<NotificationPreference> = {
        id: 'pref-1',
        userId: 'user-1',
        companyId: 'co-1',
        notificationType: NotificationType.INVOICE_ISSUED,
        channel: 'whatsapp',
        frequency: NotificationFrequency.IMMEDIATE,
        isEnabled: true,
      };
      preferencesRepo.findOne.mockResolvedValue(existing);
      preferencesRepo.save.mockResolvedValue({
        ...existing,
        frequency: NotificationFrequency.DAILY_DIGEST,
      });
      preferencesRepo.find.mockResolvedValue([existing]);

      const dto: UpdateNotificationPreferencesDto = {
        preferences: [
          {
            notificationType: NotificationType.INVOICE_ISSUED,
            channel: 'whatsapp',
            frequency: NotificationFrequency.DAILY_DIGEST,
            isEnabled: true,
          },
        ],
      };

      await service.updatePreferences('user-1', 'co-1', dto);

      expect(preferencesRepo.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          companyId: 'co-1',
          notificationType: NotificationType.INVOICE_ISSUED,
          channel: 'whatsapp',
        },
      });
      expect(preferencesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          frequency: NotificationFrequency.DAILY_DIGEST,
        }),
      );
    });

    it('creates a new preference when it does not exist', async () => {
      preferencesRepo.findOne.mockResolvedValue(null);
      const newPref = {
        userId: 'user-1',
        companyId: 'co-1',
        notificationType: NotificationType.PAYMENT_REMINDER,
        channel: 'email',
        frequency: NotificationFrequency.WEEKLY_DIGEST,
        isEnabled: false,
      };
      preferencesRepo.create.mockReturnValue(newPref);
      preferencesRepo.save.mockResolvedValue(newPref);
      preferencesRepo.find.mockResolvedValue([newPref]);

      const dto: UpdateNotificationPreferencesDto = {
        preferences: [
          {
            notificationType: NotificationType.PAYMENT_REMINDER,
            channel: 'email',
            frequency: NotificationFrequency.WEEKLY_DIGEST,
            isEnabled: false,
          },
        ],
      };

      await service.updatePreferences('user-1', 'co-1', dto);

      expect(preferencesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          companyId: 'co-1',
          notificationType: NotificationType.PAYMENT_REMINDER,
          channel: 'email',
        }),
      );
      expect(preferencesRepo.save).toHaveBeenCalledWith(newPref);
    });
  });
});
