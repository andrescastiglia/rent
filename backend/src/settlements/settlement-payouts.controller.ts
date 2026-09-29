import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CommunicationsService } from '../communications/communications.service';
import { SettlementPayoutsService } from './settlement-payouts.service';
import {
  RequestSettlementPayoutDto,
  ReviewSettlementPayoutDto,
  SettlementPayoutOverviewDto,
} from './dto/settlement-payout.dto';
type Actor = { user: { id: string; companyId: string } };
@Controller('settlements')
export class SettlementPayoutsController {
  constructor(
    private readonly payouts: SettlementPayoutsService,
    private readonly communications: CommunicationsService,
  ) {}
  @Get(':id/payout')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: SettlementPayoutOverviewDto })
  overview(@Param('id', ParseUUIDPipe) id: string, @Request() req: Actor) {
    return this.payouts.overview(id, req.user.companyId);
  }
  @Post(':id/payout')
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: SettlementPayoutOverviewDto })
  request(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestSettlementPayoutDto,
    @Request() req: Actor,
  ) {
    return this.payouts.request(id, req.user.companyId, req.user.id, dto);
  }
  @Post(':id/payout/review')
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: SettlementPayoutOverviewDto })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSettlementPayoutDto,
    @Request() req: Actor,
  ) {
    return this.payouts.review(id, req.user.companyId, req.user.id, dto);
  }
  @Post('internal/process-payouts')
  @Public()
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.payouts.processDue();
  }
}
