import { Body, Controller, Delete, Get, Post, Request } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CompleteMercadoLibreAuthorizationDto,
  MercadoLibreAuthorizationDto,
  MercadoLibreConnectionStatusDto,
} from './dto/mercadolibre-authorization.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MercadoLibreConnectionsService } from './mercadolibre-connections.service';

type Actor = { user: { id: string; companyId: string } };

@Controller('integrations/mercadolibre')
@Roles(UserRole.ADMIN)
export class MercadoLibreConnectionsController {
  constructor(private readonly connections: MercadoLibreConnectionsService) {}

  @ApiOkResponse({ type: MercadoLibreConnectionStatusDto })
  @Get('status')
  status(@Request() req: Actor) {
    return this.connections.status(req.user.companyId);
  }

  @ApiCreatedResponse({ type: MercadoLibreAuthorizationDto })
  @Post('authorization')
  begin(@Request() req: Actor) {
    return this.connections.begin(req.user.companyId, req.user.id);
  }

  @ApiCreatedResponse({ type: MercadoLibreConnectionStatusDto })
  @Post('authorization/complete')
  complete(
    @Body() dto: CompleteMercadoLibreAuthorizationDto,
    @Request() req: Actor,
  ) {
    return this.connections.complete(
      req.user.companyId,
      req.user.id,
      dto.state,
      dto.code,
    );
  }

  @ApiOkResponse({ type: MercadoLibreConnectionStatusDto })
  @Delete('connection')
  disconnect(@Request() req: Actor) {
    return this.connections.disconnect(req.user.companyId, req.user.id);
  }
}
