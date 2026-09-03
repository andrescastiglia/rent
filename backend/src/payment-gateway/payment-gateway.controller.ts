import {
  Body,
  Controller,
  Get,
  Headers,
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
import { PaymentGatewayTransaction } from './entities/payment-gateway-transaction.entity';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    roles?: UserRole[];
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
      req.user,
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
    return this.paymentGatewayService.findOne(id, req.user.companyId, req.user);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async processWebhook(
    @Body() notification: unknown,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
    @Query('data.id') dottedDataId?: string,
    @Query('data_id') underscoredDataId?: string,
  ): Promise<void> {
    return this.paymentGatewayService.processWebhook(notification, {
      xSignature,
      xRequestId,
      dataId: dottedDataId ?? underscoredDataId,
    });
  }
}
