import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentItem, PaymentItemType } from './entities/payment-item.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { MovementType } from './entities/tenant-account-movement.entity';
import { CreatePaymentDto, PaymentFiltersDto, UpdatePaymentDto } from './dto';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { UserRole } from '../users/entities/user.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';

type RequestUser = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
};

/**
 * Servicio para gestionar pagos de inquilinos.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(PaymentItem)
    private readonly paymentItemsRepository: Repository<PaymentItem>,
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
    @InjectRepository(Invoice)
    private readonly invoicesRepository: Repository<Invoice>,
    @InjectRepository(CreditNote)
    private readonly creditNotesRepository: Repository<CreditNote>,
    private readonly tenantAccountsService: TenantAccountsService,
    private readonly receiptPdfService: ReceiptPdfService,
    private readonly creditNotePdfService: CreditNotePdfService,
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Registra un pago del inquilino.
   * @param dto Datos del pago
   * @param userId ID del usuario que registra
   * @returns El pago creado con su recibo
   */
  async create(dto: CreatePaymentDto, _userId?: string): Promise<Payment> {
    // Verificar que la cuenta existe (throws NotFoundException if not found)
    const account = await this.tenantAccountsService.findOne(
      dto.tenantAccountId,
    );

    // Crear pago
    const computedAmount = this.computePaymentAmount(dto);

    const payment = this.paymentsRepository.create({
      companyId: account.companyId,
      tenantId: account.tenantId,
      tenantAccountId: dto.tenantAccountId,
      amount: computedAmount,
      currencyCode: dto.currencyCode || 'ARS',
      paymentDate: dto.paymentDate,
      method: dto.method,
      reference: dto.reference,
      status: PaymentStatus.PENDING,
      notes: dto.notes,
    });

    const savedPayment = await this.paymentsRepository.save(payment);

    if (dto.items && dto.items.length > 0) {
      const items = dto.items.map((item) =>
        this.paymentItemsRepository.create({
          paymentId: savedPayment.id,
          description: item.description,
          amount: item.amount,
          quantity: item.quantity ?? 1,
          type: item.type ?? PaymentItemType.CHARGE,
        }),
      );
      await this.paymentItemsRepository.save(items);
    }

    return savedPayment;
  }

  /**
   * Actualiza un pago pendiente antes de emitir el recibo.
   * @param id ID del pago
   * @param dto Datos a actualizar
   */
  async update(id: string, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findOne(id);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Only pending payments can be edited');
    }

    if (dto.paymentDate) payment.paymentDate = new Date(dto.paymentDate) as any;
    if (dto.method) payment.method = dto.method;
    if (dto.reference !== undefined) payment.reference = dto.reference;
    if (dto.notes !== undefined) payment.notes = dto.notes;
    if (dto.currencyCode) payment.currencyCode = dto.currencyCode;

    if (dto.items) {
      await this.paymentItemsRepository.delete({ paymentId: payment.id });
      if (dto.items.length > 0) {
        const items = dto.items.map((item) =>
          this.paymentItemsRepository.create({
            paymentId: payment.id,
            description: item.description,
            amount: item.amount,
            quantity: item.quantity ?? 1,
            type: item.type ?? PaymentItemType.CHARGE,
          }),
        );
        await this.paymentItemsRepository.save(items);
        payment.amount = this.computePaymentAmount(dto);
      }
    } else if (dto.amount !== undefined) {
      payment.amount = dto.amount;
    }

    await this.paymentsRepository.save(payment);
    return this.findOne(id);
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

    const tenantAccountId = await this.resolveTenantAccountId(payment);

    // Registrar movimiento en cuenta corriente (reduce deuda)
    await this.tenantAccountsService.addMovement(
      tenantAccountId,
      MovementType.PAYMENT,
      -Number(payment.amount), // Negativo porque reduce la deuda
      'payment',
      payment.id,
      `Pago recibido - ${payment.method}`,
    );

    // Aplicar pago a facturas pendientes
    const settledInvoices = await this.applyPaymentToInvoices(
      payment,
      tenantAccountId,
    );
    await this.createCreditNotesForSettledLateFees(
      payment,
      tenantAccountId,
      settledInvoices,
    );

    // Generar recibo
    await this.generateReceipt(payment);

    await this.paymentsRepository.update(payment.id, {
      tenantAccountId,
      status: PaymentStatus.COMPLETED,
    });

    return this.findOne(id);
  }

  /**
   * Aplica un pago a las facturas pendientes (FIFO).
   * @param payment Pago a aplicar
   */
  private async applyPaymentToInvoices(
    payment: Payment,
    tenantAccountId: string,
  ): Promise<Invoice[]> {
    // Obtener facturas pendientes ordenadas por fecha
    const pendingInvoices = await this.invoicesRepository.find({
      where: {
        tenantAccountId,
        status: In([
          InvoiceStatus.PENDING,
          InvoiceStatus.SENT,
          InvoiceStatus.PARTIAL,
          InvoiceStatus.OVERDUE,
        ]),
      },
      order: { dueDate: 'ASC' },
    });

    const settledWithLateFee: Invoice[] = [];
    let remainingAmount = Number(payment.amount);

    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0) break;

      const pending = Number(invoice.total) - Number(invoice.amountPaid);

      if (pending <= 0) continue;

      const toApply = Math.min(remainingAmount, pending);

      invoice.amountPaid = Number(invoice.amountPaid) + toApply;

      if (invoice.amountPaid >= invoice.total) {
        invoice.status = InvoiceStatus.PAID;
        if (Number(invoice.lateFee || 0) > 0) {
          settledWithLateFee.push(invoice);
        }
      } else {
        invoice.status = InvoiceStatus.PARTIAL;
      }

      await this.invoicesRepository.save(invoice);
      remainingAmount -= toApply;
    }

    return settledWithLateFee;
  }

  /**
   * Genera el recibo de un pago.
   * @param payment Pago
   * @returns El recibo generado
   */
  private async generateReceipt(payment: Payment): Promise<Receipt> {
    const existingReceipt = await this.receiptsRepository.findOne({
      where: { paymentId: payment.id },
    });
    if (existingReceipt) {
      return existingReceipt;
    }

    const receiptNumber = await this.generateReceiptNumber();

    const receipt = this.receiptsRepository.create({
      companyId: payment.companyId,
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
      const tenantPhone =
        payment.tenant?.user?.phone ??
        payment.tenantAccount?.lease?.tenant?.user?.phone ??
        null;
      await this.sendTenantPdfWhatsapp(
        tenantPhone,
        `Tu recibo ${savedReceipt.receiptNumber} ya está disponible.`,
        savedReceipt.pdfUrl,
      );
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
    const [lastReceipt] = await this.receiptsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    const numberMatch = (lastReceipt?.receiptNumber ?? '').match(/-(\d+)$/);
    if (numberMatch?.[1]) {
      sequence = Number.parseInt(numberMatch[1], 10) + 1;
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
        'tenantAccount.lease.tenant.user',
        'tenant',
        'tenant.user',
        'items',
        'receipt',
        'currency',
      ],
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  async findOneScoped(id: string, user: RequestUser): Promise<Payment> {
    const query = this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.tenantAccount', 'account')
      .leftJoinAndSelect('account.lease', 'lease')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .leftJoinAndSelect('payment.receipt', 'receipt')
      .leftJoinAndSelect('payment.items', 'items')
      .where('payment.id = :id', { id })
      .andWhere('payment.deleted_at IS NULL');

    this.applyVisibilityScope(query, user);

    const payment = await query.getOne();
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }
    return payment;
  }

  async findReceiptsByTenant(
    tenantId: string,
    user: RequestUser,
  ): Promise<Receipt[]> {
    const query = this.receiptsRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.payment', 'payment')
      .leftJoin('payment.tenantAccount', 'account')
      .leftJoin('account.lease', 'lease')
      .leftJoin('lease.property', 'property')
      .leftJoin('property.owner', 'owner')
      .leftJoin('owner.user', 'ownerUser')
      .leftJoin('payment.tenant', 'tenant')
      .leftJoin('tenant.user', 'tenantUser')
      .where('(payment.tenant_id = :tenantId OR tenant.user_id = :tenantId)', {
        tenantId,
      })
      .andWhere('payment.deleted_at IS NULL')
      .orderBy('receipt.issue_date', 'DESC');

    this.applyVisibilityScope(query, user);
    return query.getMany();
  }

  async listCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]> {
    return this.creditNotesRepository.find({
      where: { invoiceId },
      order: { issuedAt: 'DESC' },
    });
  }

  async findCreditNoteById(id: string): Promise<CreditNote> {
    const note = await this.creditNotesRepository.findOne({
      where: { id },
      relations: ['invoice'],
    });
    if (!note) {
      throw new NotFoundException(`Credit note with ID ${id} not found`);
    }
    return note;
  }

  /**
   * Lista pagos con filtros.
   * @param filters Filtros
   * @returns Lista paginada
   */
  async findAll(
    filters: PaymentFiltersDto,
    user?: RequestUser,
  ): Promise<{ data: Payment[]; total: number; page: number; limit: number }> {
    const {
      tenantId,
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
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('payment.receipt', 'receipt')
      .leftJoinAndSelect('payment.items', 'items')
      .where('payment.deleted_at IS NULL');

    if (tenantId) {
      query.andWhere(
        '(payment.tenant_id = :tenantId OR tenant.user_id = :tenantId)',
        { tenantId },
      );
    }

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

    if (user) {
      this.applyVisibilityScope(query, user);
    }

    query
      .orderBy('payment.paymentDate', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  private applyVisibilityScope(
    query: SelectQueryBuilder<any>,
    user: RequestUser,
  ) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
      return;
    }

    const email = (user.email ?? '').trim().toLowerCase();
    const phone = (user.phone ?? '').trim();

    if (user.role === UserRole.OWNER) {
      query.andWhere(
        `(owner.user_id = :scopeUserId OR LOWER(ownerUser.email) = :scopeEmail OR (:scopePhone <> '' AND ownerUser.phone = :scopePhone))`,
        {
          scopeUserId: user.id,
          scopeEmail: email,
          scopePhone: phone,
        },
      );
      return;
    }

    if (user.role === UserRole.TENANT) {
      query.andWhere(
        `(tenant.user_id = :scopeUserId OR LOWER(tenantUser.email) = :scopeEmail OR (:scopePhone <> '' AND tenantUser.phone = :scopePhone))`,
        {
          scopeUserId: user.id,
          scopeEmail: email,
          scopePhone: phone,
        },
      );
    }
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

    await this.paymentsRepository.update(payment.id, {
      status: PaymentStatus.CANCELLED,
    });
    return this.findOne(id);
  }

  private async createCreditNotesForSettledLateFees(
    payment: Payment,
    tenantAccountId: string,
    invoices: Invoice[],
  ): Promise<void> {
    for (const invoice of invoices) {
      const lateFeeAmount = Number(invoice.lateFee || 0);
      if (lateFeeAmount <= 0) {
        continue;
      }

      const existing = await this.creditNotesRepository.findOne({
        where: { invoiceId: invoice.id, paymentId: payment.id },
      });
      if (existing) {
        continue;
      }

      const noteNumber = await this.generateCreditNoteNumber();
      const note = this.creditNotesRepository.create({
        companyId: payment.companyId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        tenantAccountId,
        noteNumber,
        amount: lateFeeAmount,
        currencyCode: invoice.currencyCode || payment.currencyCode || 'ARS',
        reason: `Mora vinculada a factura ${invoice.invoiceNumber}`,
        status: CreditNoteStatus.ISSUED,
      });

      const savedNote = await this.creditNotesRepository.save(note);

      // Apply a credit movement to the tenant account for the late fee.
      await this.tenantAccountsService.addMovement(
        tenantAccountId,
        MovementType.DISCOUNT,
        -lateFeeAmount,
        'credit_note',
        savedNote.id,
        `Nota de crédito ${savedNote.noteNumber} por mora`,
      );

      try {
        const fullInvoice = await this.invoicesRepository.findOne({
          where: { id: invoice.id },
          relations: ['lease', 'lease.tenant', 'lease.tenant.user'],
        });
        if (fullInvoice) {
          savedNote.pdfUrl = await this.creditNotePdfService.generate(
            savedNote,
            fullInvoice,
          );
          await this.creditNotesRepository.save(savedNote);
          await this.sendTenantPdfWhatsapp(
            fullInvoice.lease?.tenant?.user?.phone ?? null,
            `Se emitió la nota de crédito ${savedNote.noteNumber} por ${savedNote.currencyCode} ${Number(savedNote.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}.`,
            savedNote.pdfUrl,
          );
        }
      } catch (error) {
        console.error('Failed to generate credit note PDF:', error);
      }
    }
  }

  private async generateCreditNoteNumber(): Promise<string> {
    const [lastNote] = await this.creditNotesRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    const numberMatch = (lastNote?.noteNumber ?? '').match(/-(\d+)$/);
    if (numberMatch?.[1]) {
      sequence = Number.parseInt(numberMatch[1], 10) + 1;
    }

    return `NC-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }

  private async resolveTenantAccountId(payment: Payment): Promise<string> {
    if (payment.tenantAccountId) {
      return payment.tenantAccountId;
    }

    if (payment.invoiceId) {
      const invoice = await this.invoicesRepository.findOne({
        where: { id: payment.invoiceId },
      });
      if (invoice?.tenantAccountId) {
        return invoice.tenantAccountId;
      }
    }

    throw new BadRequestException(
      'Payment cannot be confirmed without a tenant account',
    );
  }

  private async sendTenantPdfWhatsapp(
    phone: string | null | undefined,
    text: string,
    pdfUrl?: string | null,
  ): Promise<void> {
    if (!phone || !pdfUrl) {
      return;
    }

    try {
      await this.whatsappService.sendTextMessage(phone, text, pdfUrl);
    } catch (error) {
      console.error('Failed to send WhatsApp PDF notification:', error);
    }
  }

  private computePaymentAmount(
    dto: Pick<CreatePaymentDto, 'items' | 'amount'>,
  ): number {
    if (!dto.items || dto.items.length === 0) {
      if (dto.amount === undefined || dto.amount === null) {
        throw new BadRequestException('Amount is required without items');
      }
      return dto.amount;
    }

    const sum = dto.items.reduce((acc, item) => {
      const quantity = item.quantity ?? 1;
      const sign = item.type === PaymentItemType.DISCOUNT ? -1 : 1;
      return acc + sign * Number(item.amount) * quantity;
    }, 0);

    if (sum <= 0) {
      throw new BadRequestException('Total amount must be greater than zero');
    }

    if (dto.amount !== undefined && Math.abs(dto.amount - sum) > 0.01) {
      throw new BadRequestException('Amount does not match items total');
    }

    return Number(sum.toFixed(2));
  }
}
