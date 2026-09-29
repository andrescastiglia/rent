import { Body, Controller, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ScheduledBillingService } from './scheduled-billing.service';
import { ScheduledBillingDto } from './dto/scheduled-billing.dto';

@Controller('invoices/internal')
export class ScheduledBillingController {
  constructor(private readonly billing: ScheduledBillingService) {}
  @Public()
  @Post('generate-due')
  generate(
    @Body() dto: ScheduledBillingDto,
    @Headers('x-batch-billing-token') token?: string,
  ) {
    this.billing.assertToken(token);
    return this.billing.process(dto);
  }
}
