import { Controller, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CommunicationsService } from '../communications/communications.service';
import { SaleReceiptEffectsService } from './sale-receipt-effects.service';

@Controller('sales/internal')
export class SaleReceiptEffectsController {
  constructor(
    private readonly effects: SaleReceiptEffectsService,
    private readonly communications: CommunicationsService,
  ) {}

  @Public()
  @Post('process-receipts')
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.effects.processDue();
  }
}
