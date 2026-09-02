import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  Payment,
  PaymentActivityType,
  PaymentStatus,
} from './entities/payment.entity';
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
import { CommunicationsService } from '../communications/communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../communications/entities/communication-template.entity';

type RequestUser = {
  id: string;
  companyId: string;
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
    private readonly communicationsService: CommunicationsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Registra un pago del inquilino.
   * @param dto Datos del pago
   * @param userId ID del usuario que registra
   * @returns El pago creado con su recibo
   */
  async create(
    dto: CreatePaymentDto,
    _userId: string | undefined,
    companyId: string,
  ): Promise<Payment> {
    // Verificar que la cuenta existe (throws NotFoundException if not found)
    const account = await this.tenantAccountsService.findOne(
      dto.tenantAccountId,
      companyId,
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
      activityType: dto.activityType ?? PaymentActivityType.MONTHLY,
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
  async update(
    id: string,
    dto: UpdatePaymentDto,
    companyId: string,
  ): Promise<Payment> {
    const payment = await this.findOne(id, companyId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Only pending payments can be edited');
    }

    if (dto.paymentDate) payment.paymentDate = new Date(dto.paymentDate) as any;
    if (dto.method) payment.method = dto.method;
    if (dto.activityType) payment.activityType = dto.activityType;
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
    return this.findOne(id, companyId);
  }

  /**
   * Confirma un pago y genera el recibo.
   * @param id ID del pago
   * @returns El pago confirmado con recibo
   */
  async confirm(id: string, companyId: string): Promise<Payment> {
    const transactionResult = await this.dataSource.transaction(
      async (manager) => {
        const paymentsRepository = manager.getRepository(Payment);
        const invoicesRepository = manager.getRepository(Invoice);
        const payment = await this.findPaymentForUpdate(
          paymentsRepository,
          id,
          companyId,
        );

        if (payment.status !== PaymentStatus.PENDING) {
          throw new BadRequestException('Payment is not pending');
        }

        const tenantAccountId = await this.resolveTenantAccountId(
          payment,
          invoicesRepository,
        );

        await this.tenantAccountsService.addMovementWithManager(
          manager,
          tenantAccountId,
          MovementType.PAYMENT,
          -Number(payment.amount),
          'payment',
          payment.id,
          `Pago recibido - ${payment.method}`,
          payment.companyId,
        );

        const settledInvoices = await this.applyPaymentToInvoices(
          payment,
          tenantAccountId,
          invoicesRepository,
        );
        await this.createCreditNotesForSettledLateFees(
          payment,
          tenantAccountId,
          settledInvoices,
          manager,
        );

        await this.generateReceipt(payment, manager);

        await paymentsRepository.update(payment.id, {
          tenantAccountId,
          status: PaymentStatus.COMPLETED,
        });
        return { tenantAccountId, settledInvoices };
      },
    );

    const confirmed = await this.findOne(id, companyId);
    await this.generateReceipt(confirmed);
    await this.createCreditNotesForSettledLateFees(
      confirmed,
      transactionResult.tenantAccountId,
      transactionResult.settledInvoices,
    );
    return confirmed;
  }

  /**
   * Aplica un pago a las facturas pendientes (FIFO).
   * @param payment Pago a aplicar
   */
  private async applyPaymentToInvoices(
    payment: Payment,
    tenantAccountId: string,
    repository: Repository<Invoice> = this.invoicesRepository,
  ): Promise<Invoice[]> {
    // Obtener facturas pendientes ordenadas por fecha
    const pendingInvoices = await repository.find({
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

      await repository.save(invoice);
      remainingAmount -= toApply;
    }

    return settledWithLateFee;
  }

  /**
   * Genera el recibo de un pago.
   * @param payment Pago
   * @returns El recibo generado
   */
  private async generateReceipt(
    payment: Payment,
    manager?: EntityManager,
  ): Promise<Receipt> {
    const repository = manager
      ? manager.getRepository(Receipt)
      : this.receiptsRepository;
    const existingReceipt = await repository.findOne({
      where: { paymentId: payment.id },
    });
    if (existingReceipt && (existingReceipt.pdfUrl || manager)) {
      return existingReceipt;
    }

    let savedReceipt = existingReceipt;
    if (!savedReceipt) {
      const receiptNumber = await this.generateReceiptNumber(repository);
      const receipt = repository.create({
        companyId: payment.companyId,
        paymentId: payment.id,
        receiptNumber,
        amount: payment.amount,
        currencyCode: payment.currencyCode,
        issuedAt: new Date(),
      });
      savedReceipt = await repository.save(receipt);
    }

    if (manager) {
      return savedReceipt;
    }

    // Generar PDF
    try {
      const pdfUrl = await this.receiptPdfService.generate(
        savedReceipt,
        payment,
      );
      savedReceipt.pdfUrl = pdfUrl;
      await repository.save(savedReceipt);
      await this.dispatchPaymentReceived(payment, savedReceipt);
    } catch (error) {
      console.error('Failed to generate receipt PDF:', error);
    }

    return savedReceipt;
  }

  private async dispatchPaymentReceived(
    payment: Payment,
    receipt: Receipt,
  ): Promise<void> {
    const tenant =
      payment.tenant ?? payment.tenantAccount?.lease?.tenant ?? null;
    const user = tenant?.user;
    const channel =
      tenant?.preferredContactChannel ?? CommunicationChannel.WHATSAPP;
    const recipient =
      channel === CommunicationChannel.EMAIL ? user?.email : user?.phone;
    if (!tenant || !user || !recipient) return;
    const name = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    await this.communicationsService.dispatchEvent({
      companyId: payment.companyId,
      event: CommunicationEvent.PAYMENT_RECEIVED,
      recipientRole: CommunicationRecipientRole.TENANT,
      recipientId: tenant.id,
      channel,
      recipient,
      locale: user.language ?? 'es',
      variables: {
        nombre: name,
        monto: Number(payment.amount).toFixed(2),
        moneda: payment.currencyCode,
        recibo: receipt.receiptNumber,
        saldo: payment.tenantAccount?.balance ?? null,
        link_recibo: receipt.pdfUrl,
      },
      fallbackSubject: `Pago recibido - ${receipt.receiptNumber}`,
      fallbackBody:
        'Hola {{nombre}}, confirmamos tu pago de {{moneda}} {{monto}}. Recibo {{recibo}}: {{link_recibo}}',
      consented: tenant.contactConsent,
      relatedEntityType: 'payment',
      relatedEntityId: payment.id,
      metadata: {
        receiptId: receipt.id,
        attachmentUrl: receipt.pdfUrl,
      },
    });
  }

  /**
   * Genera número de recibo secuencial.
   * @returns Número de recibo
   */
  private async generateReceiptNumber(
    repository: Repository<Receipt> = this.receiptsRepository,
  ): Promise<string> {
    const [lastReceipt] = await repository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    const numberMatch = /-(\d+)$/.exec(lastReceipt?.receiptNumber ?? '');
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
  async findOne(id: string, companyId: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id, companyId },
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
      .andWhere('payment.company_id = :companyId', {
        companyId: user.companyId,
      })
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
      .andWhere('payment.company_id = :companyId', {
        companyId: user.companyId,
      })
      .andWhere('payment.deleted_at IS NULL')
      .orderBy('receipt.issuedAt', 'DESC');

    this.applyVisibilityScope(query, user);
    return query.getMany();
  }

  async listCreditNotesByInvoice(
    invoiceId: string,
    companyId: string,
  ): Promise<CreditNote[]> {
    return this.creditNotesRepository.find({
      where: { invoiceId, companyId },
      order: { issuedAt: 'DESC' },
    });
  }

  async findCreditNoteById(id: string, companyId: string): Promise<CreditNote> {
    const note = await this.creditNotesRepository.findOne({
      where: { id, companyId },
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
    user: RequestUser,
  ): Promise<{ data: Payment[]; total: number; page: number; limit: number }> {
    const {
      tenantId,
      tenantAccountId,
      leaseId,
      propertyId,
      status,
      method,
      activityType,
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
      .where('payment.deleted_at IS NULL')
      .andWhere('payment.company_id = :companyId', {
        companyId: user.companyId,
      });

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

    if (propertyId) {
      query.andWhere('lease.property_id = :propertyId', { propertyId });
    }

    if (status) {
      query.andWhere('payment.status = :status', { status });
    }

    if (method) {
      query.andWhere('payment.method = :method', { method });
    }

    if (activityType) {
      query.andWhere('payment.activity_type = :activityType', { activityType });
    }

    if (fromDate) {
      query.andWhere('payment.payment_date >= :fromDate', { fromDate });
    }

    if (toDate) {
      query.andWhere('payment.payment_date <= :toDate', { toDate });
    }

    this.applyVisibilityScope(query, user);

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
  async cancel(id: string, companyId: string): Promise<Payment> {
    await this.dataSource.transaction(async (manager) => {
      const paymentsRepository = manager.getRepository(Payment);
      const payment = await this.findPaymentForUpdate(
        paymentsRepository,
        id,
        companyId,
      );

      if (payment.status === PaymentStatus.CANCELLED) {
        throw new BadRequestException('Payment is already cancelled');
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        await this.tenantAccountsService.addMovementWithManager(
          manager,
          payment.tenantAccountId,
          MovementType.ADJUSTMENT,
          Number(payment.amount),
          'payment',
          payment.id,
          `Anulación pago`,
          payment.companyId,
        );
      }

      await paymentsRepository.update(payment.id, {
        status: PaymentStatus.CANCELLED,
      });
    });
    return this.findOne(id, companyId);
  }

  private async createCreditNotesForSettledLateFees(
    payment: Payment,
    tenantAccountId: string,
    invoices: Invoice[],
    manager?: EntityManager,
  ): Promise<void> {
    const creditNotesRepository = manager
      ? manager.getRepository(CreditNote)
      : this.creditNotesRepository;
    const invoicesRepository = manager
      ? manager.getRepository(Invoice)
      : this.invoicesRepository;
    for (const invoice of invoices) {
      const lateFeeAmount = Number(invoice.lateFee || 0);
      if (lateFeeAmount <= 0) {
        continue;
      }

      const existing = await creditNotesRepository.findOne({
        where: { invoiceId: invoice.id, paymentId: payment.id },
      });
      let savedNote = existing;
      if (!savedNote) {
        const noteNumber = await this.generateCreditNoteNumber(
          creditNotesRepository,
        );
        const note = creditNotesRepository.create({
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

        savedNote = await creditNotesRepository.save(note);
        if (manager) {
          await this.tenantAccountsService.addMovementWithManager(
            manager,
            tenantAccountId,
            MovementType.DISCOUNT,
            -lateFeeAmount,
            'credit_note',
            savedNote.id,
            `Nota de crédito ${savedNote.noteNumber} por mora`,
            payment.companyId,
          );
        } else {
          await this.tenantAccountsService.addMovement(
            tenantAccountId,
            MovementType.DISCOUNT,
            -lateFeeAmount,
            'credit_note',
            savedNote.id,
            `Nota de crédito ${savedNote.noteNumber} por mora`,
            payment.companyId,
          );
        }
      }

      if (manager || savedNote.pdfUrl) {
        continue;
      }

      try {
        const fullInvoice = await invoicesRepository.findOne({
          where: { id: invoice.id },
          relations: ['lease', 'lease.tenant', 'lease.tenant.user'],
        });
        if (fullInvoice) {
          savedNote.pdfUrl = await this.creditNotePdfService.generate(
            savedNote,
            fullInvoice,
          );
          await creditNotesRepository.save(savedNote);
          await this.sendTenantPdfWhatsapp(
            fullInvoice.lease?.tenant?.user?.phone ?? null,
            `Se emitió la nota de crédito ${savedNote.noteNumber} por ${savedNote.currencyCode} ${Number(savedNote.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}.`,
            savedNote.pdfUrl,
            {
              templateName: 'credit_note_issued',
              templateLanguage:
                fullInvoice.lease?.tenant?.user?.language ?? 'es',
              templateParameters: [
                savedNote.noteNumber,
                `${savedNote.currencyCode} ${Number(savedNote.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
              ],
              companyId: payment.companyId,
              relatedEntityType: 'payment',
              relatedEntityId: payment.id,
            },
          );
        }
      } catch (error) {
        console.error('Failed to generate credit note PDF:', error);
      }
    }
  }

  private async generateCreditNoteNumber(
    repository: Repository<CreditNote> = this.creditNotesRepository,
  ): Promise<string> {
    const [lastNote] = await repository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    const numberMatch = /-(\d+)$/.exec(lastNote?.noteNumber ?? '');
    if (numberMatch?.[1]) {
      sequence = Number.parseInt(numberMatch[1], 10) + 1;
    }

    return `NC-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }

  private async resolveTenantAccountId(
    payment: Payment,
    repository: Repository<Invoice> = this.invoicesRepository,
  ): Promise<string> {
    if (payment.tenantAccountId) {
      return payment.tenantAccountId;
    }

    if (payment.invoiceId) {
      const invoice = await repository.findOne({
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

  private async findPaymentForUpdate(
    repository: Repository<Payment>,
    id: string,
    companyId: string,
  ): Promise<Payment> {
    const payment = await repository.findOne({
      where: { id, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }
    return payment;
  }

  private async sendTenantPdfWhatsapp(
    phone: string | null | undefined,
    text: string,
    pdfUrl?: string | null,
    template?: {
      templateName: string;
      templateLanguage?: string;
      templateParameters: string[];
      companyId?: string;
      relatedEntityType?: 'payment' | 'invoice';
      relatedEntityId?: string;
    },
  ): Promise<void> {
    if (!phone || !pdfUrl) {
      return;
    }

    try {
      if (template) {
        await this.whatsappService.sendTemplateMessage(
          phone,
          template.templateName,
          template.templateLanguage ?? 'es',
          template.templateParameters,
          {
            textFallback: text,
            pdfUrl,
            context: {
              companyId: template.companyId,
              relatedEntityType: template.relatedEntityType,
              relatedEntityId: template.relatedEntityId,
            },
          },
        );
        return;
      }

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
