import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { PaymentsService } from './payments.service';
import { TenantAccountsService } from './tenant-accounts.service';
import { CreatePaymentDto, PaymentFiltersDto, UpdatePaymentDto } from './dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DocumentsService } from '../documents/documents.service';

/**
 * Controlador para gestión de pagos.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly tenantAccountsService: TenantAccountsService,
    private readonly documentsService: DocumentsService,
  ) {}

  /**
   * Registra un nuevo pago.
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(@Body() dto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.create(dto, req.user.id);
  }

  /**
   * Confirma un pago y genera recibo.
   */
  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  confirm(@Param('id') id: string) {
    return this.paymentsService.confirm(id);
  }

  /**
   * Actualiza un pago pendiente antes de emitir el recibo.
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentsService.update(id, dto);
  }

  /**
   * Lista pagos con filtros.
   */
  @Get()
  findAll(@Query() filters: PaymentFiltersDto, @Request() req: any) {
    return this.paymentsService.findAll(filters, req.user);
  }

  /**
   * Lista recibos por inquilino.
   */
  @Get('tenant/:tenantId/receipts')
  findReceiptsByTenant(
    @Param('tenantId') tenantId: string,
    @Request() req: any,
  ) {
    return this.paymentsService.findReceiptsByTenant(tenantId, req.user);
  }

  /**
   * Obtiene un pago por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.paymentsService.findOneScoped(id, req.user);
  }

  /**
   * Cancela un pago.
   */
  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  cancel(@Param('id') id: string) {
    return this.paymentsService.cancel(id);
  }

  /**
   * Descarga el recibo PDF de un pago.
   */
  @Get(':id/receipt')
  async getReceipt(
    @Param('id') id: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const payment = await this.paymentsService.findOneScoped(id, req.user);

    if (!payment.receipt?.pdfUrl) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      payment.receipt.pdfUrl,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="recibo-${payment.receipt.receiptNumber}.pdf"`,
    });

    return res.send(buffer);
  }
}
