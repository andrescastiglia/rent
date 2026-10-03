import { randomUUID } from 'node:crypto';
import {
  assertNoUncertainSettlementPayout,
  compensateTransferredAllocation,
} from './settlement-compensation';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { allocatePaymentDocumentNumber } from './payment-document-number';
import {
  calculatePaymentAmount,
  paymentCents,
  paymentNumber,
} from './payment-amount';
import { reversedInvoiceStatus } from './reversed-invoice-status';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import {
  Injectable,
  ConflictException,
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
  Not,
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
import {
  CreditNote,
  CreditNoteOrigin,
  CreditNoteStatus,
} from './entities/credit-note.entity';
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

export type CollectionSummary = {
  fromDate: string;
  toDate: string;
  totalCount: number;
  totals: Array<{ currency: string; amount: string; count: number }>;
  details: Array<{
    id: string;
    paymentNumber: string | null;
    tenantName: string;
    currency: string;
    amount: string;
  }>;
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
        ...(payment.invoiceId ? { id: payment.invoiceId } : {}),
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
      const settledLateFee = await this.applyInvoiceAllocation(
        payment,
        invoice,
        paid,
        toApply,
        total,
        repository,
        allocationsRepository,
      );
      if (settledLateFee) settledWithLateFee.push(invoice);
      remainingAmount -= toApply;
    }

    return settledWithLateFee;
  }

  private async applyInvoiceAllocation(
    payment: Payment,
    invoice: Invoice,
    paid: bigint,
    toApply: bigint,
    total: bigint,
    repository: Repository<Invoice>,
    allocationsRepository?: Repository<PaymentAllocation>,
  ) {
    let settledLateFee = false;
    const previousInvoiceStatus = invoice.status;

    invoice.amountPaid = paymentNumber(paid + toApply);

    if (paid + toApply >= total) {
      invoice.status = InvoiceStatus.PAID;
      if (Number(invoice.lateFee || 0) > 0) {
        settledLateFee = true;
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
    return settledLateFee;
  }

  /**
   * Genera el recibo de un pago.
   * @param payment Pago
   * @returns El recibo generado
   */
  private async generateReceipt(
    payment: Payment,
    manager: EntityManager,
  ): Promise<Receipt> {
    const repository = manager.getRepository(Receipt);
    const existingReceipt = await repository.findOne({
      where: { paymentId: payment.id },
    });
    if (existingReceipt) {
      return existingReceipt;
    }

    const receiptNumber = await allocatePaymentDocumentNumber(
      manager,
      'receipt',
    );
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
      search,
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

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Invalid pagination');
    if (search?.trim())
      query.andWhere(
        "(concat_ws(' ', tenantUser.first_name, tenantUser.last_name) ILIKE :search OR concat_ws(' ', property.name, property.address_street, property.address_city, property.address_state) ILIKE :search OR payment.reference_number ILIKE :search OR receipt.receipt_number ILIKE :search)",
        { search: `%${search.trim()}%` },
      );
    this.applyVisibilityScope(query, user);

    query
      .orderBy('payment.paymentDate', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  async collectionSummary(
    filters: { fromDate: string; toDate: string },
    user: RequestUser,
  ): Promise<CollectionSummary> {
    this.requireCompanyScope(user);
    if (!isAdminOrStaff(user))
      throw new ForbiddenException('Collection summary requires staff access');
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (
      !datePattern.test(filters.fromDate) ||
      !datePattern.test(filters.toDate) ||
      filters.fromDate > filters.toDate
    )
      throw new BadRequestException('Invalid collection date range');
    // One statement keeps the full totals and the bounded detail in the same
    // snapshot. Aggregate before joining any one-to-many payment relations.
    const [result] = await this.dataSource.query(
      `WITH eligible AS (
         SELECT p.id, p.payment_number, p.tenant_id, p.payment_date, p.currency,
                p.amount - COALESCE(p.refunded_amount, 0) AS net_amount
           FROM payments p
          WHERE p.company_id = $1::uuid AND p.deleted_at IS NULL
            AND p.status = 'completed'
            AND p.payment_date BETWEEN $2::date AND $3::date
       ), totals AS (
         SELECT currency, SUM(net_amount)::text AS amount, COUNT(*)::int AS count
           FROM eligible GROUP BY currency ORDER BY currency
       ), detail AS (
         SELECT e.id, e.payment_number AS "paymentNumber", e.currency,
                e.net_amount::text AS amount,
                concat_ws(' ', u.first_name, u.last_name) AS "tenantName"
           FROM (SELECT * FROM eligible ORDER BY payment_date DESC, id DESC LIMIT 20) e
           LEFT JOIN tenants t ON t.id = e.tenant_id AND t.company_id = $1::uuid AND t.deleted_at IS NULL
           LEFT JOIN users u ON u.id = t.user_id AND u.company_id = $1::uuid AND u.deleted_at IS NULL
          ORDER BY e.payment_date DESC, e.id DESC
       )
       SELECT (SELECT COUNT(*)::int FROM eligible) AS "totalCount",
              COALESCE((SELECT jsonb_agg(totals) FROM totals), '[]'::jsonb) AS totals,
              COALESCE((SELECT jsonb_agg(detail) FROM detail), '[]'::jsonb) AS details`,
      [user.companyId, filters.fromDate, filters.toDate],
    );
    return {
      ...filters,
      totalCount: result.totalCount,
      totals: result.totals,
      details: result.details,
    };
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
          await this.cancelWithManager(manager, id, companyId);
          return this.findOne(id, companyId, manager);
        },
      ),
    );
  }

  async cancelWithManager(
    manager: EntityManager,
    id: string,
    companyId: string,
  ): Promise<void> {
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
        amount: paymentNumber(
          paymentCents(payment.amount) -
            paymentCents(payment.refundedAmount ?? 0),
        ),
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
  }

  async refund(
    id: string,
    companyId: string,
    dto: RefundPaymentDto,
    actorId?: string,
    executionKey?: string,
  ) {
    if (!executionKey)
      throw new BadRequestException('Idempotency-Key is required for refunds');
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'payment.refund',
        { id, ...dto },
        () =>
          this.refundWithManager(
            manager,
            id,
            companyId,
            { ...dto, reference: dto.reference ?? executionKey },
            actorId,
          ),
      ),
    );
  }

  async refundWithManager(
    manager: EntityManager,
    id: string,
    companyId: string,
    dto: RefundPaymentDto & { reference: string },
    actorId?: string,
  ) {
    const repository = manager.getRepository(Payment);
    const payment = await this.findPaymentForUpdate(repository, id, companyId);
    const [existing] = await manager.query(
      'SELECT * FROM payment_refunds WHERE company_id=$1 AND payment_id=$2 AND reference=$3',
      [companyId, id, dto.reference],
    );
    if (existing) {
      if (
        paymentCents(existing.amount) !== paymentCents(dto.amount) ||
        existing.reason !== dto.reason
      )
        throw new ConflictException(
          'Refund reference was already used for another correction',
        );
      return existing;
    }
    if (
      payment.status !== PaymentStatus.COMPLETED ||
      !payment.allocationsRecorded
    )
      throw new BadRequestException(
        'Refund requires a completed payment with allocation history',
      );
    const amount = paymentCents(dto.amount),
      previouslyRefunded = paymentCents(payment.refundedAmount ?? 0);
    const available = paymentCents(payment.amount) - previouslyRefunded;
    if (amount <= 0n || amount > available || dto.reason.trim().length < 5)
      throw new BadRequestException(
        'Refund must be positive and cannot exceed the remaining payment',
      );
    const accountId = await this.resolveTenantAccountId(
      payment,
      manager.getRepository(Invoice),
    );
    await this.assertPaymentCurrency(
      manager,
      accountId,
      companyId,
      payment.currencyCode,
    );
    const refundId = randomUUID();
    const [refund] = await manager.query(
      `INSERT INTO payment_refunds
      (id,company_id,payment_id,amount,currency,reference,reason,document_number,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        refundId,
        companyId,
        id,
        paymentNumber(amount),
        payment.currencyCode,
        dto.reference,
        dto.reason,
        `REF-${refundId}`,
        actorId ?? null,
      ],
    );
    await this.tenantAccountsService.addMovementWithManager(manager, {
      accountId,
      companyId,
      type: MovementType.REFUND,
      amount: paymentNumber(amount),
      referenceType: 'payment_refund',
      referenceId: refundId,
      description: `Devolución: ${dto.reason}`,
    });
    await this.refundAllocations(manager, payment, amount, available, refundId);
    const cumulative = previouslyRefunded + amount;
    await repository.update(id, {
      refundedAmount: paymentNumber(cumulative),
      ...(cumulative === paymentCents(payment.amount)
        ? { status: PaymentStatus.REFUNDED }
        : {}),
    });
    if (cumulative === paymentCents(payment.amount)) {
      const receipts = manager.getRepository(Receipt);
      const receipt = await receipts.findOne({
        where: { companyId, paymentId: id },
      });
      if (receipt) {
        receipt.cancelledAt = new Date();
        await receipts.save(receipt);
      }
    }
    return refund;
  }

  private async refundAllocations(
    manager: EntityManager,
    payment: Payment,
    amount: bigint,
    available: bigint,
    refundId: string,
  ) {
    const id = payment.id,
      companyId = payment.companyId;
    const allocationRepository = manager.getRepository(PaymentAllocation);
    const allocations = await allocationRepository.find({
      where: { companyId, paymentId: id, reversedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    const allocated = allocations.reduce(
      (sum, allocation) =>
        sum +
        paymentCents(allocation.amount) -
        paymentCents(allocation.refundedAmount ?? 0),
      0n,
    );
    if (allocated > available)
      throw new ConflictException(
        'Allocation history exceeds available payment',
      );
    // Return unapplied account credit first, then unwind the most recent allocation.
    let remaining =
      amount > available - allocated ? amount - (available - allocated) : 0n;
    for (const allocation of allocations) {
      if (remaining <= 0n) break;
      const active =
        paymentCents(allocation.amount) -
        paymentCents(allocation.refundedAmount ?? 0);
      const reversed = remaining < active ? remaining : active;
      if (reversed <= 0n) continue;
      await this.refundAllocation(
        manager,
        payment,
        allocation,
        reversed,
        refundId,
      );
      remaining -= reversed;
    }
    if (remaining !== 0n)
      throw new ConflictException('Refund could not reconcile all allocations');
  }

  private async refundAllocation(
    manager: EntityManager,
    payment: Payment,
    allocation: PaymentAllocation,
    reversed: bigint,
    refundId: string,
  ) {
    const companyId = payment.companyId,
      id = payment.id;
    const allocationRepository = manager.getRepository(PaymentAllocation);
    await assertNoUncertainSettlementPayout(
      manager,
      companyId,
      allocation.invoiceId,
    );
    const invoices = manager.getRepository(Invoice);
    const invoice = await invoices.findOne({
      where: { id: allocation.invoiceId, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice || paymentCents(invoice.amountPaid) < reversed)
      throw new ConflictException(
        'Refund allocation requires accounting review',
      );
    const paid = paymentCents(invoice.amountPaid) - reversed;
    invoice.amountPaid = paymentNumber(paid);
    let baseline = allocation.previousInvoiceStatus;
    if (paid === 0n) {
      const [original] = await manager.query(
        `SELECT previous_invoice_status FROM payment_allocations
          WHERE company_id=$1 AND invoice_id=$2 AND previous_invoice_status IN ('pending','sent','overdue')
          ORDER BY created_at DESC,id DESC LIMIT 1`,
        [companyId, invoice.id],
      );
      baseline = original?.previous_invoice_status ?? baseline;
    }
    invoice.status = reversedInvoiceStatus(invoice, paid, baseline);
    await invoices.save(invoice);
    allocation.refundedAmount = paymentNumber(
      paymentCents(allocation.refundedAmount ?? 0) + reversed,
    );
    if (
      paymentCents(allocation.refundedAmount) ===
      paymentCents(allocation.amount)
    )
      allocation.reversedAt = new Date();
    await allocationRepository.save(allocation);
    await this.cancelConditionalCredits(manager, payment, [invoice.id], false);
    await compensateTransferredAllocation(manager, {
      companyId,
      invoiceId: invoice.id,
      paymentId: id,
      referenceId: refundId,
      amount: reversed,
    });
  }

  async listRefunds(id: string, user: RequestUser) {
    await this.findOneScoped(id, user);
    return this.dataSource.query(
      'SELECT * FROM payment_refunds WHERE company_id=$1 AND payment_id=$2 ORDER BY created_at,id',
      [user.companyId, id],
    );
  }

  private async createCreditNotesForSettledLateFees(
    payment: Payment,
    tenantAccountId: string,
    invoices: Invoice[],
    manager: EntityManager,
  ): Promise<void> {
    const creditNotesRepository = manager.getRepository(CreditNote);
    for (const invoice of invoices) {
      const lateFeeAmount = Number(invoice.lateFee || 0);
      if (lateFeeAmount <= 0) {
        continue;
      }

      const existing = await creditNotesRepository.findOne({
        where: {
          companyId: payment.companyId,
          invoiceId: invoice.id,
          status: CreditNoteStatus.ISSUED,
          origin: CreditNoteOrigin.LATE_FEE_SETTLEMENT,
        },
      });
      const legacy = await creditNotesRepository.findOne({
        where: {
          companyId: payment.companyId,
          invoiceId: invoice.id,
          status: CreditNoteStatus.ISSUED,
          origin: IsNull(),
          paymentId: Not(IsNull()),
        },
      });
      if (legacy)
        throw new BadRequestException(
          'Legacy credit note requires manual review before settling late fees',
        );
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
    manager: EntityManager;
  }): Promise<CreditNote> {
    const {
      payment,
      tenantAccountId,
      invoice,
      lateFeeAmount,
      creditNotesRepository,
      manager,
    } = input;
    const noteNumber = await allocatePaymentDocumentNumber(
      manager,
      'credit_note',
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
      origin: CreditNoteOrigin.LATE_FEE_SETTLEMENT,
      status: CreditNoteStatus.ISSUED,
    });
    const savedNote = await creditNotesRepository.save(note);
    const description = `Nota de crédito ${savedNote.noteNumber} por mora`;

    await this.tenantAccountsService.addMovementWithManager(manager, {
      accountId: tenantAccountId,
      type: MovementType.DISCOUNT,
      amount: -lateFeeAmount,
      referenceType: 'credit_note',
      referenceId: savedNote.id,
      description,
      companyId: payment.companyId,
    });

    return savedNote;
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
    const receiptsRepository = manager.getRepository(Receipt);
    const allocations = await allocationsRepository.find({
      where: {
        companyId: payment.companyId,
        paymentId: payment.id,
        reversedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });

    const unsettledInvoiceIds: string[] = [];
    const corrections: Array<{ invoiceId: string; amount: bigint }> = [];
    for (const allocation of allocations) {
      await assertNoUncertainSettlementPayout(
        manager,
        payment.companyId,
        allocation.invoiceId,
      );
      const invoice = await invoicesRepository.findOne({
        where: { id: allocation.invoiceId, companyId: payment.companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${allocation.invoiceId} not found`,
        );
      }
      const paid = paymentCents(invoice.amountPaid),
        allocated =
          paymentCents(allocation.amount) -
          paymentCents(allocation.refundedAmount ?? 0);
      if (allocated <= 0n || allocated > paid)
        throw new BadRequestException(
          'Payment allocation exceeds the recorded paid amount; manual review is required',
        );
      const remainingPaid = paid - allocated;
      let previousUnpaidStatus = allocation.previousInvoiceStatus;
      if (
        remainingPaid === 0n &&
        ![InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED].includes(
          invoice.status,
        )
      ) {
        // Latest allocation from an unpaid state belongs to the current payment cycle.
        const [baseline] = await manager.query(
          `SELECT previous_invoice_status FROM payment_allocations
           WHERE company_id=$1 AND invoice_id=$2 AND previous_invoice_status IN ('pending','sent','overdue')
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [payment.companyId, invoice.id],
        );
        previousUnpaidStatus =
          baseline?.previous_invoice_status ?? previousUnpaidStatus;
      }
      invoice.status = reversedInvoiceStatus(
        invoice,
        remainingPaid,
        previousUnpaidStatus,
      );
      invoice.amountPaid = paymentNumber(remainingPaid);
      if (
        remainingPaid < paymentCents(invoice.total) ||
        [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED].includes(
          invoice.status,
        )
      )
        unsettledInvoiceIds.push(invoice.id);
      await invoicesRepository.save(invoice);
      corrections.push({ invoiceId: invoice.id, amount: allocated });
      allocation.reversedAt = new Date();
      await allocationsRepository.save(allocation);
    }

    await this.cancelConditionalCredits(manager, payment, unsettledInvoiceIds);
    for (const correction of corrections)
      await compensateTransferredAllocation(manager, {
        companyId: payment.companyId,
        invoiceId: correction.invoiceId,
        paymentId: payment.id,
        referenceId: payment.id,
        amount: correction.amount,
      });

    const receipt = await receiptsRepository.findOne({
      where: { paymentId: payment.id, companyId: payment.companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (receipt) {
      receipt.cancelledAt = new Date();
      await receiptsRepository.save(receipt);
    }
  }

  private async cancelConditionalCredits(
    manager: EntityManager,
    payment: Payment,
    unsettledInvoiceIds: string[],
    includePaymentNotes = true,
  ) {
    const creditNotesRepository = manager.getRepository(CreditNote);
    const creditNotes = await creditNotesRepository.find({
      where: [
        ...(includePaymentNotes
          ? [
              {
                companyId: payment.companyId,
                paymentId: payment.id,
                status: CreditNoteStatus.ISSUED,
              },
            ]
          : []),
        ...(unsettledInvoiceIds.length
          ? [
              {
                companyId: payment.companyId,
                invoiceId: In(unsettledInvoiceIds),
                paymentId: Not(IsNull()),
                status: CreditNoteStatus.ISSUED,
              },
            ]
          : []),
      ],
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const note of creditNotes) {
      if (
        note.paymentId !== payment.id &&
        note.origin !== CreditNoteOrigin.LATE_FEE_SETTLEMENT
      )
        throw new BadRequestException(
          'Legacy credit note requires manual review before reversing this payment',
        );
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
      note.cancelledAt = new Date();
      note.cancelledByPaymentId = payment.id;
      await creditNotesRepository.save(note);
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
