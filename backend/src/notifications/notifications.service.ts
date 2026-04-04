import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationFrequency,
  NotificationPreference,
  NotificationType,
} from './entities/notification-preference.entity';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

const DEFAULT_CHANNEL = 'whatsapp';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferencesRepo: Repository<NotificationPreference>,
  ) {}

  getDefaultPreferences(): Array<{
    notificationType: NotificationType;
    channel: string;
    frequency: NotificationFrequency;
    isEnabled: boolean;
  }> {
    return Object.values(NotificationType).map((type) => ({
      notificationType: type,
      channel: DEFAULT_CHANNEL,
      frequency: NotificationFrequency.IMMEDIATE,
      isEnabled: true,
    }));
  }

  async getPreferences(
    userId: string,
    companyId: string,
  ): Promise<NotificationPreference[]> {
    const existing = await this.preferencesRepo.find({
      where: { userId, companyId },
      order: { notificationType: 'ASC' },
    });

    if (existing.length > 0) {
      return existing;
    }

    const defaults = this.getDefaultPreferences().map((d) =>
      this.preferencesRepo.create({ ...d, userId, companyId }),
    );
    return this.preferencesRepo.save(defaults);
  }

  async updatePreferences(
    userId: string,
    companyId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference[]> {
    for (const item of dto.preferences) {
      const existing = await this.preferencesRepo.findOne({
        where: {
          userId,
          companyId,
          notificationType: item.notificationType,
          channel: item.channel,
        },
      });

      if (existing) {
        existing.frequency = item.frequency;
        existing.isEnabled = item.isEnabled;
        await this.preferencesRepo.save(existing);
      } else {
        const pref = this.preferencesRepo.create({
          userId,
          companyId,
          notificationType: item.notificationType,
          channel: item.channel,
          frequency: item.frequency,
          isEnabled: item.isEnabled,
        });
        await this.preferencesRepo.save(pref);
      }
    }

    return this.getPreferences(userId, companyId);
  }
}
