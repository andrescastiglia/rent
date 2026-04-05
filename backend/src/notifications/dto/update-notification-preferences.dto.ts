import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NotificationFrequency,
  NotificationType,
} from '../entities/notification-preference.entity';

export class NotificationPreferenceItemDto {
  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @IsString()
  channel: string;

  @IsEnum(NotificationFrequency)
  frequency: NotificationFrequency;

  @IsBoolean()
  isEnabled: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences: NotificationPreferenceItemDto[];
}
