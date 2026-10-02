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
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';
import { PaymentsService } from './payments.service';
import { TenantAccountsService } from './tenant-accounts.service';
import { CreatePaymentDto, PaymentFiltersDto, UpdatePaymentDto } from './dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DocumentsService } from '../documents/documents.service';

/**
 * Controlador para gestión de pagos.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
@Authenticated('payments')
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
  create(
    @Body() dto: CreatePaymentDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.paymentsService.create(
      dto,
      req.user.id,
      req.user.companyId,
      executionKey,
    );
  }

  /**
   * Confirma un pago y genera recibo.
   */
  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  confirm(
    @Param('id') id: string,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.paymentsService.confirm(id, req.user.companyId, executionKey);
  }

  /**
   * Actualiza un pago pendiente antes de emitir el recibo.
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.paymentsService.update(
      id,
      dto,
      req.user.companyId,
      executionKey,
    );
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
  cancel(
    @Param('id') id: string,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.paymentsService.cancel(id, req.user.companyId, executionKey);
  }

  @Post(':id/refunds')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  refund(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.paymentsService.refund(
      id,
      req.user.companyId,
      dto,
      req.user.id,
      executionKey,
    );
  }

  @Get(':id/refunds')
  listRefunds(@Param('id') id: string, @Request() req: any) {
    return this.paymentsService.listRefunds(id, req.user);
  }

  @Get(':id/refunds/:refundId/pdf')
  async refundDocument(
    @Param('id') id: string,
    @Param('refundId') refundId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const refunds = await this.paymentsService.listRefunds(id, req.user);
    const refund = refunds.find((item: { id: string }) => item.id === refundId);
    if (!refund) return res.status(404).json({ message: 'Refund not found' });
    const buffer = await generateCustomDocumentPdf(
      `Devolución ${refund.document_number}`,
      `Cobro: ${id}\nImporte devuelto: ${refund.currency} ${refund.amount}\nMotivo: ${refund.reason}\nReferencia: ${refund.reference}\nFecha: ${new Date(refund.created_at).toISOString()}`,
      `Constancia de devolución: ${refund.id}`,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="devolucion-${refund.document_number}.pdf"`,
    });
    return res.send(buffer);
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

    const { buffer, contentType } =
      await this.documentsService.downloadByFileUrl(payment.receipt.pdfUrl, {
        companyId: req.user.companyId,
        entityType: 'receipt',
        entityId: payment.receipt.id,
      });

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="recibo-${payment.receipt.receiptNumber}.pdf"`,
    });

    return res.send(buffer);
  }
}
