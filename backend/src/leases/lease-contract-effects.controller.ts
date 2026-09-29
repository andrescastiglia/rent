import { AmendmentsService } from './amendments.service';
import { Controller, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CommunicationsService } from '../communications/communications.service';
import { LeaseContractEffectsService } from './lease-contract-effects.service';

@Controller('leases/internal')
export class LeaseContractEffectsController {
  constructor(
    private readonly effects: LeaseContractEffectsService,
    private readonly communications: CommunicationsService,
    private readonly amendments: AmendmentsService,
  ) {}
  @Public()
  @Post('process-amendments')
  processAmendments(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.amendments.processDue();
  }
  @Public()
  @Post('process-contracts')
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.effects.processDue();
  }
}
