import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  async getMyPreferences(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getPreferences(
      req.user.id,
      req.user.companyId,
    );
  }

  @Patch('preferences')
  async updateMyPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(
      req.user.id,
      req.user.companyId,
      dto,
    );
  }

  @Get('preferences/:userId')
  @Roles(UserRole.ADMIN)
  async getUserPreferences(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.getPreferences(userId, req.user.companyId);
  }
}
