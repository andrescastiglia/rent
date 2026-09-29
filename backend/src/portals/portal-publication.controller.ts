import { ApiOkResponse } from '@nestjs/swagger';
import { PortalOperationOverviewDto } from './dto/portal-operation.dto';
import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CommunicationsService } from '../communications/communications.service';
import { PortalPublicationOutboxService } from './portal-publication-outbox.service';

@Controller('portals')
export class PortalPublicationController {
  constructor(
    private readonly outbox: PortalPublicationOutboxService,
    private readonly communications: CommunicationsService,
  ) {}

  @ApiOkResponse({ type: PortalOperationOverviewDto })
  @Get('listings/:id/operation')
  @Roles(UserRole.ADMIN)
  latest(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { companyId: string } },
  ) {
    return this.outbox.latest(id, req.user.companyId);
  }

  @Post('internal/process-publications')
  @Public()
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.outbox.processDue();
  }
}
