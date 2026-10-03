import { AgendaModule } from '../agenda/agenda.module';
import { WebNotificationsService } from './web-notifications.service';
import {
  WebNotificationsController,
  WebNotificationsInternalController,
} from './web-notifications.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [AgendaModule, TypeOrmModule.forFeature([NotificationPreference])],
  controllers: [
    WebNotificationsController,
    WebNotificationsInternalController,
    NotificationsController,
  ],
  providers: [WebNotificationsService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
