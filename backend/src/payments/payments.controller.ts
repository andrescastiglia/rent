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
import { CreatePaymentDto, PaymentFiltersDto } from './dto';
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
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  create(@Body() dto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.create(dto, req.user.id);
  }

  /**
   * Confirma un pago y genera recibo.
   */
  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  confirm(@Param('id') id: string) {
    return this.paymentsService.confirm(id);
  }

  /**
   * Lista pagos con filtros.
   */
  @Get()
  findAll(@Query() filters: PaymentFiltersDto) {
    return this.paymentsService.findAll(filters);
  }

  /**
   * Obtiene un pago por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  /**
   * Cancela un pago.
   */
  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  cancel(@Param('id') id: string) {
    return this.paymentsService.cancel(id);
  }

  /**
   * Descarga el recibo PDF de un pago.
   */
  @Get(':id/receipt')
  async getReceipt(@Param('id') id: string, @Res() res: Response) {
    const payment = await this.paymentsService.findOne(id);

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
