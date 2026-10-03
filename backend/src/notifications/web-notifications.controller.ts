import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AgendaActor } from '../agenda/agenda.dto';
import { WebNotificationsService } from './web-notifications.service';
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Authenticated('self-service')
@Controller('notifications/web')
export class WebNotificationsController {
  constructor(private readonly service: WebNotificationsService) {}
  @Get() list(
    @Request() r: { user: AgendaActor },
    @Query('page') page?: string,
  ) {
    return this.service.list(r.user, page ? Number(page) : 1);
  }
  @Get('config') config() {
    return this.service.config();
  }
  @Get('preferences') prefs(@Request() r: { user: AgendaActor }) {
    return this.service.preferences(r.user);
  }
  @Patch('preferences') setPrefs(
    @Request() r: { user: AgendaActor },
    @Body() body: unknown,
  ) {
    return this.service.setPreferences(r.user, body);
  }
  @Post('subscriptions') subscribe(
    @Request() r: { user: AgendaActor },
    @Body() body: unknown,
  ) {
    return this.service.subscribe(r.user, body);
  }
  @Post('subscriptions/remove') remove(
    @Request() r: { user: AgendaActor },
    @Body() body: { endpoint: string },
  ) {
    return this.service.unsubscribe(r.user, body.endpoint);
  }
  @Post(':id/read') read(
    @Request() r: { user: AgendaActor },
    @Param('id') id: string,
  ) {
    return this.service.read(r.user, id);
  }
  @Get(':id/destination') destination(
    @Request() r: { user: AgendaActor },
    @Param('id') id: string,
  ) {
    return this.service.destination(r.user, id);
  }
}
@Controller('notifications/internal')
export class WebNotificationsInternalController {
  constructor(private readonly service: WebNotificationsService) {}
  @Public() @Post('process-agenda') async process(
    @Headers('x-batch-communications-token') provided?: string,
  ) {
    const secret = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    if (
      !secret ||
      !provided ||
      Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
    )
      throw new UnauthorizedException();
    return this.service.process();
  }
}
