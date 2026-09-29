import {
  calculatePaymentAmount,
  paymentCents,
  paymentNumber,
} from './payment-amount';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  Payment,
  PaymentActivityType,
  PaymentStatus,
} from './entities/payment.entity';
import { PaymentItem, PaymentItemType } from './entities/payment-item.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { TenantAccount } from './entities/tenant-account.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { MovementType } from './entities/tenant-account-movement.entity';
import { CreatePaymentDto, PaymentFiltersDto, UpdatePaymentDto } from './dto';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';
type RequestUser = {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
  email?: string | null;
  phone?: string | null;
};

export type PaymentConfirmationTransactionResult = {
  tenantAccountId: string;
  settledInvoices: Invoice[];
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
    userId: string | undefined,
    companyId: string,
    executionKey?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'payment.create',
        { ...dto },
        () => this.createWithManager(manager, dto, userId, companyId),
      ),
    );
  }

  async createWithManager(
    manager: EntityManager,
    dto: CreatePaymentDto,
    _userId: string | undefined,
    companyId: string,
  ): Promise<Payment> {
    const account = await manager.getRepository(TenantAccount).findOne({
      where: { id: dto.tenantAccountId, companyId },
    });
    if (!account) {
      throw new NotFoundException(
        `Tenant account with ID ${dto.tenantAccountId} not found`,
      );
    }

    if ((dto.currencyCode || 'ARS') !== account.currencyCode)
      throw new BadRequestException(
        'Payment currency must match the tenant account',
      );

    const paymentsRepository = manager.getRepository(Payment);
    const paymentItemsRepository = manager.getRepository(PaymentItem);
    const payment = paymentsRepository.create({
      companyId: account.companyId,
      tenantId: account.tenantId,
      tenantAccountId: dto.tenantAccountId,
      amount: this.computePaymentAmount(dto),
      currencyCode: dto.currencyCode || 'ARS',
      paymentDate: dto.paymentDate,
      method: dto.method,
      activityType: dto.activityType ?? PaymentActivityType.MONTHLY,
      reference: dto.reference,
      status: PaymentStatus.PENDING,
      notes: dto.notes,
    });
    const savedPayment = await paymentsRepository.save(payment);

    if (dto.items && dto.items.length > 0) {
      const items = dto.items.map((item) =>
        paymentItemsRepository.create({
          paymentId: savedPayment.id,
          description: item.description,
          amount: item.amount,
          quantity: item.quantity ?? 1,
          type: item.type ?? PaymentItemType.CHARGE,
        }),
      );
      await paymentItemsRepository.save(items);
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
    executionKey?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'payment.update',
        { id, ...dto },
        async () => {
          const paymentsRepository = manager.getRepository(Payment);
          const paymentItemsRepository = manager.getRepository(PaymentItem);
          const payment = await this.findPaymentForUpdate(
            paymentsRepository,
            id,
            companyId,
          );

          if (payment.status !== PaymentStatus.PENDING) {
            throw new BadRequestException(
              'Only pending payments can be edited',
            );
          }

          if (
            dto.tenantAccountId !== undefined &&
            dto.tenantAccountId.toLowerCase() !==
              payment.tenantAccountId?.toLowerCase()
          )
            throw new BadRequestException(
              'Payment tenant account cannot be changed',
            );
          await this.assertPaymentCurrency(
            manager,
            await this.resolveTenantAccountId(
              payment,
              manager.getRepository(Invoice),
            ),
            companyId,
            dto.currencyCode ?? payment.currencyCode,
          );
          const currentItems =
            dto.items ??
            (await paymentItemsRepository.find({
              where: { paymentId: payment.id },
            }));
          if (dto.amount !== undefined || dto.items !== undefined) {
            payment.amount = this.computePaymentAmount({
              amount:
                dto.amount ?? (dto.items?.length ? undefined : payment.amount),
              items: currentItems,
            });
          }

          if (dto.paymentDate)
            payment.paymentDate = new Date(dto.paymentDate) as any;
          if (dto.method) payment.method = dto.method;
          if (dto.activityType) payment.activityType = dto.activityType;
          if (dto.reference !== undefined) payment.reference = dto.reference;
          if (dto.notes !== undefined) payment.notes = dto.notes;
          if (dto.currencyCode) payment.currencyCode = dto.currencyCode;

          if (dto.items) {
            await paymentItemsRepository.delete({ paymentId: payment.id });
            if (dto.items.length > 0) {
              const items = dto.items.map((item) =>
                paymentItemsRepository.create({
                  paymentId: payment.id,
                  description: item.description,
                  amount: item.amount,
                  quantity: item.quantity ?? 1,
                  type: item.type ?? PaymentItemType.CHARGE,
                }),
              );
              await paymentItemsRepository.save(items);
            }
          }

          await paymentsRepository.save(payment);
          return this.findOne(id, companyId, manager);
        },
      ),
    );
  }

  /**
   * Confirma un pago y genera el recibo.
   * @param id ID del pago
   * @returns El pago confirmado con recibo
   */
  async confirm(
    id: string,
    companyId: string,
    executionKey?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'payment.confirm',
        { id },
        async () => {
          await this.confirmWithManager(manager, id, companyId);
          return this.findOne(id, companyId, manager);
        },
      ),
    );
  }

  async confirmWithManager(
    manager: EntityManager,
    id: string,
    companyId: string,
  ): Promise<PaymentConfirmationTransactionResult> {
    const paymentsRepository = manager.getRepository(Payment);
    const invoicesRepository = manager.getRepository(Invoice);
    const allocationsRepository = manager.getRepository(PaymentAllocation);
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

    await this.assertPaymentCurrency(
      manager,
      tenantAccountId,
      companyId,
      payment.currencyCode,
    );
    const items = await manager
      .getRepository(PaymentItem)
      .find({ where: { paymentId: id } });
    this.computePaymentAmount({ amount: payment.amount, items });

    await this.tenantAccountsService.addMovementWithManager(manager, {
      accountId: tenantAccountId,
      type: MovementType.PAYMENT,
      amount: -Number(payment.amount),
      referenceType: 'payment',
      referenceId: payment.id,
      description: `Pago recibido - ${payment.method}`,
      companyId: payment.companyId,
    });

    const settledInvoices = await this.applyPaymentToInvoices(
      payment,
      tenantAccountId,
      invoicesRepository,
      allocationsRepository,
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
      allocationsRecorded: true,
    });
    await manager.query(
      `INSERT INTO payment_effects_outbox (company_id, payment_id)
       VALUES ($1::uuid, $2::uuid) ON CONFLICT (payment_id) DO NOTHING`,
      [companyId, id],
    );
    return { tenantAccountId, settledInvoices };
  }

  /**
   * Aplica un pago a las facturas pendientes (FIFO).
   * @param payment Pago a aplicar
   */
  private async applyPaymentToInvoices(
    payment: Payment,
    tenantAccountId: string,
    repository: Repository<Invoice> = this.invoicesRepository,
    allocationsRepository?: Repository<PaymentAllocation>,
  ): Promise<Invoice[]> {
    // Obtener facturas pendientes ordenadas por fecha
    const pendingInvoices = await repository.find({
      where: {
        tenantAccountId,
        companyId: payment.companyId,
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
    let remainingAmount = paymentCents(payment.amount);
    if (
      pendingInvoices.some(
        (invoice) => invoice.currencyCode !== payment.currencyCode,
      )
    )
      throw new BadRequestException('Invoice currency must match the payment');
    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0n) break;

      const total = paymentCents(invoice.total),
        paid = paymentCents(invoice.amountPaid);
      const pending = total - paid;

      if (pending <= 0n) continue;

      const toApply = remainingAmount < pending ? remainingAmount : pending;
      const previousInvoiceStatus = invoice.status;

      invoice.amountPaid = paymentNumber(paid + toApply);

      if (paid + toApply >= total) {
        invoice.status = InvoiceStatus.PAID;
        if (Number(invoice.lateFee || 0) > 0) {
          settledWithLateFee.push(invoice);
        }
      } else {
        invoice.status = InvoiceStatus.PARTIAL;
      }

      await repository.save(invoice);
      if (allocationsRepository) {
        await allocationsRepository.save(
          allocationsRepository.create({
            companyId: payment.companyId,
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: paymentNumber(toApply),
            previousInvoiceStatus,
            reversedAt: null,
          }),
        );
      }
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
    if (existingReceipt) {
      return existingReceipt;
    }

    const receiptNumber = await this.generateReceiptNumber(repository, manager);
    return repository.save(
      repository.create({
        companyId: payment.companyId,
        paymentId: payment.id,
        receiptNumber,
        amount: payment.amount,
        currencyCode: payment.currencyCode,
        issuedAt: new Date(),
      }),
    );
  }

  /**
   * Genera número de recibo secuencial.
   * @returns Número de recibo
   */
  private async generateReceiptNumber(
    repository: Repository<Receipt> = this.receiptsRepository,
    manager?: EntityManager,
  ): Promise<string> {
    await this.lockDocumentNumber(manager, 'receipt-number');
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
  async findOne(
    id: string,
    companyId: string,
    manager?: EntityManager,
  ): Promise<Payment> {
    const payment = await (
      manager?.getRepository(Payment) ?? this.paymentsRepository
    ).findOne({
      where: { id, companyId },
      relations: [
        'tenantAccount',
        'tenantAccount.lease',
        'tenantAccount.lease.tenant',
        'tenantAccount.lease.tenant.user',
        'tenant',
        'tenant.user',
        'items',
        'allocations',
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
    this.requireCompanyScope(user);
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
    this.requireCompanyScope(user);
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
    this.requireCompanyScope(user);
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
    if (isAdminOrStaff(user)) {
      return;
    }

    const roles = getUserRoles(user);
    const scopes = [
      roles.includes(UserRole.OWNER) ? 'owner.user_id = :scopeUserId' : null,
      roles.includes(UserRole.TENANT) ? 'tenant.user_id = :scopeUserId' : null,
    ].filter((scope): scope is string => Boolean(scope));
    if (scopes.length > 0) {
      query.andWhere(`(${scopes.join(' OR ')})`, { scopeUserId: user.id });
      return;
    }

    throw new ForbiddenException('Unsupported payment access role');
  }

  private requireCompanyScope(user: RequestUser): void {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
  }

  /**
   * Cancela un pago.
   * @param id ID del pago
   * @returns El pago cancelado
   */
  async cancel(
    id: string,
    companyId: string,
    executionKey?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'payment.cancel',
        { id },
        async () => {
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
            if (!payment.allocationsRecorded) {
              throw new BadRequestException(
                'Legacy payment lacks allocation history and requires manual reversal',
              );
            }
            await this.tenantAccountsService.addMovementWithManager(manager, {
              accountId: payment.tenantAccountId,
              type: MovementType.ADJUSTMENT,
              amount: Number(payment.amount),
              referenceType: 'payment',
              referenceId: payment.id,
              description: `Anulación pago`,
              companyId: payment.companyId,
            });
            await this.reverseCompletedPayment(manager, payment);
          }

          await paymentsRepository.update(payment.id, {
            status: PaymentStatus.CANCELLED,
          });
          return this.findOne(id, companyId, manager);
        },
      ),
    );
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
    for (const invoice of invoices) {
      const lateFeeAmount = Number(invoice.lateFee || 0);
      if (lateFeeAmount <= 0) {
        continue;
      }

      const existing = await creditNotesRepository.findOne({
        where: { invoiceId: invoice.id, paymentId: payment.id },
      });
      if (!existing)
        await this.issueLateFeeCreditNote({
          payment,
          tenantAccountId,
          invoice,
          lateFeeAmount,
          creditNotesRepository,
          manager,
        });
    }
  }

  private async issueLateFeeCreditNote(input: {
    payment: Payment;
    tenantAccountId: string;
    invoice: Invoice;
    lateFeeAmount: number;
    creditNotesRepository: Repository<CreditNote>;
    manager?: EntityManager;
  }): Promise<CreditNote> {
    const {
      payment,
      tenantAccountId,
      invoice,
      lateFeeAmount,
      creditNotesRepository,
      manager,
    } = input;
    const noteNumber = await this.generateCreditNoteNumber(
      creditNotesRepository,
      manager,
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
    const savedNote = await creditNotesRepository.save(note);
    const description = `Nota de crédito ${savedNote.noteNumber} por mora`;

    if (manager) {
      await this.tenantAccountsService.addMovementWithManager(manager, {
        accountId: tenantAccountId,
        type: MovementType.DISCOUNT,
        amount: -lateFeeAmount,
        referenceType: 'credit_note',
        referenceId: savedNote.id,
        description,
        companyId: payment.companyId,
      });
    } else {
      await this.tenantAccountsService.addMovement(
        tenantAccountId,
        MovementType.DISCOUNT,
        -lateFeeAmount,
        'credit_note',
        savedNote.id,
        description,
        payment.companyId,
      );
    }

    return savedNote;
  }

  private async generateCreditNoteNumber(
    repository: Repository<CreditNote> = this.creditNotesRepository,
    manager?: EntityManager,
  ): Promise<string> {
    await this.lockDocumentNumber(manager, 'credit-note-number');
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

  private async lockDocumentNumber(
    manager: EntityManager | undefined,
    namespace: string,
  ): Promise<void> {
    if (!manager) return;
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [namespace],
    );
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
        where: { id: payment.invoiceId, companyId: payment.companyId },
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

  private async reverseCompletedPayment(
    manager: EntityManager,
    payment: Payment,
  ): Promise<void> {
    const allocationsRepository = manager.getRepository(PaymentAllocation);
    const invoicesRepository = manager.getRepository(Invoice);
    const creditNotesRepository = manager.getRepository(CreditNote);
    const receiptsRepository = manager.getRepository(Receipt);
    const allocations = await allocationsRepository.find({
      where: {
        companyId: payment.companyId,
        paymentId: payment.id,
        reversedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });

    for (const allocation of allocations) {
      const invoice = await invoicesRepository.findOne({
        where: { id: allocation.invoiceId, companyId: payment.companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${allocation.invoiceId} not found`,
        );
      }
      invoice.amountPaid = Math.max(
        0,
        Number(invoice.amountPaid) - Number(allocation.amount),
      );
      invoice.status = allocation.previousInvoiceStatus;
      await invoicesRepository.save(invoice);
      allocation.reversedAt = new Date();
      await allocationsRepository.save(allocation);
    }

    const creditNotes = await creditNotesRepository.find({
      where: {
        companyId: payment.companyId,
        paymentId: payment.id,
        status: CreditNoteStatus.ISSUED,
      },
      lock: { mode: 'pessimistic_write' },
    });
    for (const note of creditNotes) {
      if (note.tenantAccountId) {
        await this.tenantAccountsService.addMovementWithManager(manager, {
          accountId: note.tenantAccountId,
          type: MovementType.ADJUSTMENT,
          amount: Number(note.amount),
          referenceType: 'credit_note_cancellation',
          referenceId: note.id,
          description: `Anulación nota de crédito ${note.noteNumber}`,
          companyId: payment.companyId,
        });
      }
      note.status = CreditNoteStatus.CANCELLED;
      await creditNotesRepository.save(note);
    }

    const receipt = await receiptsRepository.findOne({
      where: { paymentId: payment.id, companyId: payment.companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (receipt) {
      receipt.cancelledAt = new Date();
      await receiptsRepository.save(receipt);
    }
  }

  private async assertPaymentCurrency(
    manager: EntityManager,
    accountId: string,
    companyId: string,
    currencyCode: string,
  ): Promise<void> {
    if (!accountId)
      throw new BadRequestException('Payment requires a tenant account');
    const account = await manager.getRepository(TenantAccount).findOne({
      where: { id: accountId, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!account)
      throw new NotFoundException(
        `Tenant account with ID ${accountId} not found`,
      );
    if (account.currencyCode !== currencyCode)
      throw new BadRequestException(
        'Payment currency must match the tenant account',
      );
  }

  private computePaymentAmount(
    dto: Pick<CreatePaymentDto, 'items' | 'amount'>,
  ): number {
    return calculatePaymentAmount(dto);
  }
}
