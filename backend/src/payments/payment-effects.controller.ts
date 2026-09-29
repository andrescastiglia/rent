import { Controller, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CommunicationsService } from '../communications/communications.service';
import { PaymentEffectsService } from './payment-effects.service';

@Controller('payments/internal')
export class PaymentEffectsController {
  constructor(
    private readonly effects: PaymentEffectsService,
    private readonly communications: CommunicationsService,
  ) {}

  @Public()
  @Post('process-effects')
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.effects.processDue();
  }
}
