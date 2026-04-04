import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaymentGatewayService } from './payment-gateway.service';
import { CreatePaymentPreferenceDto } from './dto/create-payment-preference.dto';
import { WebhookNotificationDto } from './dto/webhook-notification.dto';
import { PaymentGatewayTransaction } from './entities/payment-gateway-transaction.entity';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('payment-gateway')
@UseGuards(JwtAuthGuard)
export class PaymentGatewayController {
  constructor(private readonly paymentGatewayService: PaymentGatewayService) {}

  @Post('preferences')
  @Roles(UserRole.ADMIN, UserRole.TENANT)
  async createPreference(
    @Body() dto: CreatePaymentPreferenceDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    initPoint: string;
    sandboxInitPoint: string;
    transactionId: string;
  }> {
    return this.paymentGatewayService.createPreference(
      req.user.companyId,
      req.user.id,
      dto,
    );
  }

  @Get('transactions')
  @Roles(UserRole.ADMIN)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('invoiceId') invoiceId?: string,
  ): Promise<PaymentGatewayTransaction[]> {
    return this.paymentGatewayService.findAll(req.user.companyId, invoiceId);
  }

  @Get('transactions/:id')
  @Roles(UserRole.ADMIN, UserRole.TENANT)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<PaymentGatewayTransaction> {
    return this.paymentGatewayService.findOne(id, req.user.companyId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async processWebhook(
    @Body() notification: WebhookNotificationDto,
  ): Promise<void> {
    return this.paymentGatewayService.processWebhook(notification);
  }
}
