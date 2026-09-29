import { ApiOkResponse } from '@nestjs/swagger';
import { BfaLeaseOverviewDto } from './dto/bfa-lease-overview.dto';
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
import { BfaStampsService } from './bfa-stamps.service';

@Controller('digital-signatures')
export class BfaStampsController {
  constructor(
    private readonly stamps: BfaStampsService,
    private readonly communications: CommunicationsService,
  ) {}

  @ApiOkResponse({ type: BfaLeaseOverviewDto })
  @Get('bfa/leases/:leaseId')
  @Roles(UserRole.ADMIN)
  forLease(
    @Param('leaseId', ParseUUIDPipe) id: string,
    @Request() req: { user: { companyId: string } },
  ) {
    return this.stamps.forLease(id, req.user.companyId);
  }

  @Post('documents/:documentId/stamp')
  @Roles(UserRole.ADMIN)
  request(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Request() req: { user: { companyId: string } },
  ) {
    return this.stamps.request(id, req.user.companyId);
  }

  @Get('documents/:documentId/stamp')
  @Roles(UserRole.ADMIN)
  find(
    @Param('documentId', ParseUUIDPipe) id: string,
    @Request() req: { user: { companyId: string } },
  ) {
    return this.stamps.find(id, req.user.companyId);
  }

  @Post('internal/process-stamps')
  @Public()
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.stamps.processDue();
  }
}
