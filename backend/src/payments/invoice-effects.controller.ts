import { Controller, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CommunicationsService } from '../communications/communications.service';
import { InvoiceEffectsService } from './invoice-effects.service';

@Controller('invoices/internal')
export class InvoiceEffectsController {
  constructor(
    private readonly effects: InvoiceEffectsService,
    private readonly communications: CommunicationsService,
  ) {}
  @Public()
  @Post('process-documents')
  process(@Headers('x-batch-communications-token') token?: string) {
    this.communications.assertBatchToken(token);
    return this.effects.processDue();
  }
}
