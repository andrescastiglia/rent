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
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AgendaService } from './agenda.service';
import {
  AgendaActor,
  AgendaQuery,
  AgendaTaskDto,
  UpdateAgendaTaskDto,
} from './agenda.dto';
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Authenticated('self-service')
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}
  @Get('config') config(@Request() r: { user: AgendaActor }) {
    return this.agenda.config(r.user);
  }
  @Get() list(@Request() r: { user: AgendaActor }, @Query() q: AgendaQuery) {
    return this.agenda.entries(r.user, q);
  }
  @Get('people') people(
    @Request() r: { user: AgendaActor },
    @Query('search') search?: string,
  ) {
    return this.agenda.people(r.user, search);
  }
  @Get('staff') staff(@Request() r: { user: AgendaActor }) {
    return this.agenda.staff(r.user);
  }
  @Get('people/:type/:id') person(
    @Request() r: { user: AgendaActor },
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.agenda.person(r.user, type, id);
  }
  @Post('tasks') create(
    @Request() r: { user: AgendaActor },
    @Body() dto: AgendaTaskDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.agenda.create(r.user, dto, key);
  }
  @Get('entries/:id') entry(
    @Request() r: { user: AgendaActor },
    @Param('id') id: string,
  ) {
    return this.agenda.entry(r.user, id);
  }
  @Get('entries/:id/history') history(
    @Request() r: { user: AgendaActor },
    @Param('id') id: string,
  ) {
    return this.agenda.history(r.user, id);
  }
  @Patch('entries/:id') update(
    @Request() r: { user: AgendaActor },
    @Param('id') id: string,
    @Body() dto: UpdateAgendaTaskDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.agenda.update(r.user, id, dto, key);
  }
  @Patch('entries/:id/settings') settings(
    @Request() r: { user: AgendaActor },
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @Headers('idempotency-key') key: string,
  ) {
    return this.agenda.entrySettings(r.user, id, dto, key);
  }
}
