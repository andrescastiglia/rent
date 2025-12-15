import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { MovementType } from './entities/tenant-account-movement.entity';
import { CreatePaymentDto, PaymentFiltersDto } from './dto';
import { ReceiptPdfService } from './receipt-pdf.service';

/**
 * Servicio para gestionar pagos de inquilinos.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Invoice)
    private invoicesRepository: Repository<Invoice>,
    private tenantAccountsService: TenantAccountsService,
    private receiptPdfService: ReceiptPdfService,
  ) {}

  /**
   * Registra un pago del inquilino.
   * @param dto Datos del pago
   * @param userId ID del usuario que registra
   * @returns El pago creado con su recibo
   */
  async create(dto: CreatePaymentDto, userId?: string): Promise<Payment> {
    // Verificar que la cuenta existe (throws NotFoundException if not found)
    await this.tenantAccountsService.findOne(dto.tenantAccountId);

    // Crear pago
    const payment = this.paymentsRepository.create({
      tenantAccountId: dto.tenantAccountId,
      amount: dto.amount,
      currencyCode: dto.currencyCode || 'ARS',
      paymentDate: dto.paymentDate,
      method: dto.method,
      reference: dto.reference,
      status: PaymentStatus.PENDING,
      notes: dto.notes,
      receivedBy: userId,
    });

    const savedPayment = await this.paymentsRepository.save(payment);

    return savedPayment;
  }

  /**
   * Confirma un pago y genera el recibo.
   * @param id ID del pago
   * @returns El pago confirmado con recibo
   */
  async confirm(id: string): Promise<Payment> {
    const payment = await this.findOne(id);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not pending');
    }

    payment.status = PaymentStatus.COMPLETED;
    await this.paymentsRepository.save(payment);

    // Registrar movimiento en cuenta corriente (reduce deuda)
    await this.tenantAccountsService.addMovement(
      payment.tenantAccountId,
      MovementType.PAYMENT,
      -Number(payment.amount), // Negativo porque reduce la deuda
      'payment',
      payment.id,
      `Pago recibido - ${payment.method}`,
    );

    // Aplicar pago a facturas pendientes
    await this.applyPaymentToInvoices(payment);

    // Generar recibo
    await this.generateReceipt(payment);

    return this.findOne(id);
  }

  /**
   * Aplica un pago a las facturas pendientes (FIFO).
   * @param payment Pago a aplicar
   */
  private async applyPaymentToInvoices(payment: Payment): Promise<void> {
    // Obtener facturas pendientes ordenadas por fecha
    const pendingInvoices = await this.invoicesRepository.find({
      where: {
        tenantAccountId: payment.tenantAccountId,
        status: InvoiceStatus.ISSUED,
      },
      order: { dueDate: 'ASC' },
    });

    let remainingAmount = Number(payment.amount);

    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0) break;

      const pending = Number(invoice.total) - Number(invoice.amountPaid);

      if (pending <= 0) continue;

      const toApply = Math.min(remainingAmount, pending);

      invoice.amountPaid = Number(invoice.amountPaid) + toApply;

      if (invoice.amountPaid >= invoice.total) {
        invoice.status = InvoiceStatus.PAID;
      } else {
        invoice.status = InvoiceStatus.PARTIALLY_PAID;
      }

      await this.invoicesRepository.save(invoice);
      remainingAmount -= toApply;
    }
  }

  /**
   * Genera el recibo de un pago.
   * @param payment Pago
   * @returns El recibo generado
   */
  private async generateReceipt(payment: Payment): Promise<Receipt> {
    const receiptNumber = await this.generateReceiptNumber();

    const receipt = this.receiptsRepository.create({
      paymentId: payment.id,
      receiptNumber,
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      issuedAt: new Date(),
    });

    const savedReceipt = await this.receiptsRepository.save(receipt);

    // Generar PDF
    try {
      const pdfUrl = await this.receiptPdfService.generate(
        savedReceipt,
        payment,
      );
      savedReceipt.pdfUrl = pdfUrl;
      await this.receiptsRepository.save(savedReceipt);
    } catch (error) {
      console.error('Failed to generate receipt PDF:', error);
    }

    return savedReceipt;
  }

  /**
   * Genera número de recibo secuencial.
   * @returns Número de recibo
   */
  private async generateReceiptNumber(): Promise<string> {
    const lastReceipt = await this.receiptsRepository.findOne({
      order: { createdAt: 'DESC' },
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    if (lastReceipt) {
      const parts = lastReceipt.receiptNumber.split('-');
      if (parts.length >= 3) {
        sequence = parseInt(parts[parts.length - 1], 10) + 1;
      }
    }

    return `REC-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Obtiene un pago por su ID.
   * @param id ID del pago
   * @returns El pago
   */
  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id },
      relations: [
        'tenantAccount',
        'tenantAccount.lease',
        'tenantAccount.lease.tenant',
        'receiver',
        'receipt',
        'currency',
      ],
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  /**
   * Lista pagos con filtros.
   * @param filters Filtros
   * @returns Lista paginada
   */
  async findAll(
    filters: PaymentFiltersDto,
  ): Promise<{ data: Payment[]; total: number; page: number; limit: number }> {
    const {
      tenantAccountId,
      leaseId,
      status,
      method,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = filters;

    const query = this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.tenantAccount', 'account')
      .leftJoinAndSelect('account.lease', 'lease')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('payment.receipt', 'receipt')
      .where('payment.deleted_at IS NULL');

    if (tenantAccountId) {
      query.andWhere('payment.tenant_account_id = :tenantAccountId', {
        tenantAccountId,
      });
    }

    if (leaseId) {
      query.andWhere('account.lease_id = :leaseId', { leaseId });
    }

    if (status) {
      query.andWhere('payment.status = :status', { status });
    }

    if (method) {
      query.andWhere('payment.method = :method', { method });
    }

    if (fromDate) {
      query.andWhere('payment.payment_date >= :fromDate', { fromDate });
    }

    if (toDate) {
      query.andWhere('payment.payment_date <= :toDate', { toDate });
    }

    query
      .orderBy('payment.paymentDate', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Cancela un pago.
   * @param id ID del pago
   * @returns El pago cancelado
   */
  async cancel(id: string): Promise<Payment> {
    const payment = await this.findOne(id);

    if (payment.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('Payment is already cancelled');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      // Revertir el movimiento en cuenta
      await this.tenantAccountsService.addMovement(
        payment.tenantAccountId,
        MovementType.ADJUSTMENT,
        Number(payment.amount), // Positivo porque revierte la reducción
        'payment',
        payment.id,
        `Anulación pago`,
      );
    }

    payment.status = PaymentStatus.CANCELLED;
    return this.paymentsRepository.save(payment);
  }
}
