import { paymentCents, paymentNumber } from './payment-amount';
import {
  assertNoUncertainSettlementPayout,
  compensateTransferredAllocation,
} from './settlement-compensation';
import { assertNoPendingBillingAmendment } from '../leases/amendment-application';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import { calculateRentAdjustment } from './rent-adjustment';
import {
  computeBillingPeriod,
  advanceBillingCalendar,
} from './billing-calendar';
import { SCHEDULED_BILLING_ELIGIBILITY } from './scheduled-billing';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import {
  CommissionInvoice,
  CommissionInvoiceStatus,
} from './entities/commission-invoice.entity';
import { Lease } from '../leases/entities/lease.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { MovementType } from './entities/tenant-account-movement.entity';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceDocumentStatusDto } from './dto/invoice-document-status.dto';
import { CreateInvoiceDto, GenerateInvoiceDto } from './dto';
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

/**
 * Servicio para gestionar facturas.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepository: Repository<Invoice>,
    @InjectRepository(CommissionInvoice)
    private readonly commissionInvoicesRepository: Repository<CommissionInvoice>,
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
    private readonly tenantAccountsService: TenantAccountsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly invoicePdf: InvoicePdfService,
  ) {}

  /**
   * Crea una factura para un contrato.
   * @param dto Datos de la factura
   * @returns La factura creada
   */
  async create(
    dto: CreateInvoiceDto,
    companyId: string,
    executionKey?: string,
  ): Promise<Invoice> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'invoice.create',
        { ...dto },
        async () => {
          const invoicesRepository = manager.getRepository(Invoice);
          const lease = await this.lockBillingLease(
            manager,
            dto.leaseId,
            companyId,
          );

          await assertNoPendingBillingAmendment(
            manager,
            lease.id,
            companyId,
            dto.periodEnd,
          );

          // Obtener o crear cuenta del inquilino
          const account = await this.tenantAccountsService.findByLease(
            dto.leaseId,
            lease.companyId,
            manager,
          );

          // Obtener propietario
          const ownerId = lease.property?.ownerId || lease.ownerId;
          if (!ownerId) {
            throw new BadRequestException(
              'Property owner not found for this lease',
            );
          }

          // Calcular total
          const totalCents =
            paymentCents(dto.subtotal) +
            paymentCents(dto.lateFee || 0) +
            paymentCents(Math.abs(dto.adjustments || 0)) *
              ((dto.adjustments || 0) < 0 ? -1n : 1n);
          if (totalCents < 0n)
            throw new BadRequestException('Invoice total cannot be negative');
          const total = paymentNumber(totalCents);

          // Generar número de factura si no se proporciona
          const invoiceNumber =
            dto.invoiceNumber ||
            (await this.generateInvoiceNumber(companyId, manager));

          const invoice = invoicesRepository.create({
            companyId: lease.companyId,
            leaseId: dto.leaseId,
            ownerId,
            tenantAccountId: account.id,
            invoiceNumber,
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            subtotal: dto.subtotal,
            lateFee: dto.lateFee || 0,
            adjustments: dto.adjustments || 0,
            total,
            currencyCode: lease.currency,
            dueDate: dto.dueDate,
            status: InvoiceStatus.DRAFT,
            notes: dto.notes,
          });

          return invoicesRepository.save(invoice);
        },
      ),
    );
  }

  /**
   * Genera una factura mensual con fechas automáticas.
   */
  async generateForLease(
    leaseId: string,
    dto: GenerateInvoiceDto,
    companyId: string,
    scheduled?: { billingDate: string },
    recoverOriginalResult = false,
  ): Promise<Invoice> {
    const parsed = GenerateInvoiceDto.zodSchema.safeParse(dto);
    if (!parsed.success)
      throw new BadRequestException('Invalid invoice generation request');
    dto = parsed.data;
    const key = dto.idempotencyKey?.toLowerCase();
    const generationRequest = JSON.stringify({
      leaseId,
      issue: dto.issue === true,
      applyLateFee: dto.applyLateFee === true,
      applyAdjustment: dto.applyAdjustment !== false,
      periodStart: dto.periodStart ?? null,
      periodEnd: dto.periodEnd ?? null,
      dueDate: dto.dueDate ?? null,
      ...(scheduled ? { scheduledFor: scheduled.billingDate } : {}),
    });
    return this.dataSource.transaction(async (manager) => {
      const invoicesRepository = manager.getRepository(Invoice);
      if (key)
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`invoice-generation:${companyId}:${key}`],
        );
      if (key && recoverOriginalResult) {
        const original = await this.recoverGeneratedInvoice(
          manager,
          { companyId, key, generationRequest, leaseId },
          true,
        );
        if (original) return original;
      }
      const lease = await this.lockBillingLease(manager, leaseId, companyId);

      if (key) {
        const existing = await this.recoverGeneratedInvoice(
          manager,
          { companyId, key, generationRequest, leaseId },
          recoverOriginalResult,
        );
        if (existing) return existing;
      }

      if (scheduled)
        await this.assertScheduledBilling(
          manager,
          lease,
          dto,
          scheduled.billingDate,
          companyId,
        );

      const account = await this.billingAccount(manager, lease, !!scheduled);

      const { periodStart, periodEnd, dueDate } = computeBillingPeriod(
        lease,
        dto,
      );

      await assertNoPendingBillingAmendment(
        manager,
        lease.id,
        companyId,
        periodEnd,
      );

      const [existing] = await manager.query(
        `SELECT id FROM invoices WHERE company_id=$1 AND lease_id=$2 AND period_start=$3 AND period_end=$4
       AND deleted_at IS NULL AND status NOT IN ('cancelled','refunded') LIMIT 1`,
        [companyId, leaseId, periodStart, periodEnd],
      );
      if (existing)
        throw new ConflictException(
          'An invoice already exists for this billing period',
        );

      const calculation = await this.applyAdjustmentIfNeeded(
        lease,
        periodStart,
        dto.applyAdjustment !== false,
        manager,
      );

      const subtotal = paymentNumber(
        paymentCents(calculation.rent) +
          paymentCents(lease.additionalExpenses || 0),
      );
      const lateFeeCalculation =
        dto.applyLateFee === true
          ? await this.tenantAccountsService.calculateLateFeeWithEvidence(
              account.id,
              lease.companyId,
              manager,
            )
          : null;
      const lateFee = lateFeeCalculation?.amount ?? 0;

      const total = paymentNumber(
        paymentCents(subtotal) + paymentCents(lateFee || 0),
      );
      if (!Number.isFinite(total) || total < 0)
        throw new BadRequestException(
          'Generated invoice total must be finite and nonnegative',
        );

      const invoiceNumber = await this.generateInvoiceNumber(
        companyId,
        manager,
      );

      const invoice = invoicesRepository.create({
        companyId: lease.companyId,
        leaseId,
        ownerId: lease.ownerId,
        tenantAccountId: account.id,
        invoiceNumber,
        periodStart,
        periodEnd,
        subtotal,
        lateFee,
        adjustments: 0,
        total,
        currencyCode: lease.currency,
        dueDate,
        status: InvoiceStatus.DRAFT,
        notes: '',
        rentCalculation: calculation.snapshot,
        lateFeeCalculation,
      });

      const saved = await invoicesRepository.save(invoice);

      advanceBillingCalendar(lease, periodStart, periodEnd);
      await manager.getRepository(Lease).save(lease);

      const result = dto.issue
        ? await this.issueWithManager(manager, saved.id, companyId)
        : saved;
      if (key)
        await manager.query(
          `INSERT INTO invoice_generations(company_id,lease_id,idempotency_key,request,invoice_id,result_snapshot)
         VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb)`,
          [
            companyId,
            leaseId,
            key,
            generationRequest,
            saved.id,
            JSON.stringify(result),
          ],
        );
      return result;
    });
  }

  private async assertScheduledBilling(
    manager: EntityManager,
    lease: Lease,
    dto: GenerateInvoiceDto,
    billingDate: string,
    companyId: string,
  ) {
    const leaseId = lease.id;

    if (lease.billingFrequency === 'custom' && !lease.billingDay)
      throw new BadRequestException('Custom billing requires a billing day');
    const [eligible] = await manager.query(
      `SELECT l.id FROM leases l WHERE ${SCHEDULED_BILLING_ELIGIBILITY} AND l.id=$2 AND l.company_id=$3`,
      [billingDate, leaseId, companyId],
    );
    const expected = computeBillingPeriod(lease, {}, billingDate);
    if (
      !eligible ||
      dto.periodStart !== expected.periodStart.toISOString().slice(0, 10) ||
      dto.periodEnd !== expected.periodEnd.toISOString().slice(0, 10) ||
      dto.dueDate !== expected.dueDate.toISOString().slice(0, 10)
    )
      throw new ConflictException(
        'Scheduled billing source changed; retry selection',
      );
  }

  private async billingAccount(
    manager: EntityManager,
    lease: Lease,
    scheduled: boolean,
  ) {
    const account = await this.tenantAccountsService.findByLease(
      lease.id,
      lease.companyId,
      manager,
    );
    if (account.currencyCode !== lease.currency)
      throw new BadRequestException(
        'Tenant account and lease currencies must match',
      );
    if (scheduled && !account.isActive)
      throw new BadRequestException(
        'Scheduled billing requires an active tenant account',
      );
    return account;
  }

  private async recoverGeneratedInvoice(
    manager: EntityManager,
    input: {
      companyId: string;
      key: string;
      generationRequest: string;
      leaseId: string;
    },
    snapshotOnly: boolean,
  ): Promise<Invoice | null> {
    const { companyId, key, generationRequest, leaseId } = input;
    const [previous] = await manager.query(
      `SELECT invoice_id,result_snapshot,request=$3::jsonb AS matches
      FROM invoice_generations WHERE company_id=$1 AND idempotency_key=$2`,
      [companyId, key, generationRequest],
    );
    if (!previous) return null;
    if (!previous.matches)
      throw new ConflictException(
        'Generation key was already used with a different request',
      );
    if (snapshotOnly) {
      if (!previous.result_snapshot)
        throw new ConflictException(
          'Original execution result unavailable; manual review is required',
        );
      return previous.result_snapshot as Invoice;
    }
    const recovered = await manager.getRepository(Invoice).findOne({
      where: { id: previous.invoice_id, companyId, leaseId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !recovered ||
      [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED].includes(
        recovered.status,
      )
    )
      throw new ConflictException(
        'Original invoice is no longer available; generation key cannot be reused',
      );
    return recovered;
  }

  /**
   * Emite una factura (cambia estado a PENDING).
   * @param id ID de la factura
   * @returns La factura emitida
   */
  async issue(
    id: string,
    companyId: string,
    executionKey?: string,
  ): Promise<Invoice> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'invoice.issue',
        { id },
        () => this.issueWithManager(manager, id, companyId),
      ),
    );
  }

  private async issueWithManager(
    manager: EntityManager,
    id: string,
    companyId: string,
  ): Promise<Invoice> {
    const invoicesRepository = manager.getRepository(Invoice);
    const sourceInvoice = await invoicesRepository.findOne({
      where: { id, companyId },
    });
    if (!sourceInvoice)
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    await this.lockBillingLease(manager, sourceInvoice.leaseId, companyId);
    const invoice = await this.findOneForUpdate(
      invoicesRepository,
      id,
      companyId,
    );

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be issued');
    }

    await assertNoPendingBillingAmendment(
      manager,
      invoice.leaseId,
      companyId,
      invoice.periodEnd,
    );

    invoice.status = InvoiceStatus.PENDING;
    invoice.issuedAt = new Date();

    const savedInvoice = await invoicesRepository.save(invoice);

    await this.tenantAccountsService.addMovementWithManager(manager, {
      accountId: invoice.tenantAccountId,
      type: MovementType.CHARGE,
      amount: Number(invoice.total),
      referenceType: 'invoice',
      referenceId: invoice.id,
      description: `Factura ${invoice.invoiceNumber}`,
      companyId: invoice.companyId,
    });

    await this.createCommissionInvoice(savedInvoice, manager);

    const source = await invoicesRepository.findOneOrFail({
      where: { id, companyId },
      relations: [
        'owner',
        'owner.user',
        'lease',
        'lease.tenant',
        'lease.tenant.user',
        'lease.property',
      ],
    });
    if (
      source.owner?.companyId !== companyId ||
      source.lease?.companyId !== companyId ||
      source.lease?.tenant?.companyId !== companyId ||
      source.lease?.property?.companyId !== companyId ||
      source.owner?.user?.companyId !== companyId ||
      source.lease?.tenant?.user?.companyId !== companyId
    )
      throw new BadRequestException('Invoice source company mismatch');
    const snapshot = await this.invoicePdf.captureSnapshot(source, manager);
    await manager.query(
      'INSERT INTO invoice_effects_outbox(company_id,invoice_id,snapshot) VALUES($1,$2,$3::jsonb)',
      [companyId, id, JSON.stringify(snapshot)],
    );

    return savedInvoice;
  }

  async documentStatus(
    id: string,
    user: RequestUser,
  ): Promise<InvoiceDocumentStatusDto> {
    await this.findOneScoped(id, user);
    const [row] = await this.dataSource.query(
      `SELECT e.status, (d.id IS NOT NULL) AS available
       FROM invoices i LEFT JOIN invoice_effects_outbox e ON e.invoice_id=i.id AND e.company_id=i.company_id
       LEFT JOIN documents d ON d.company_id=i.company_id AND d.entity_type='invoice' AND d.entity_id=i.id
         AND d.id::text=substring(i.pdf_url from 15) AND i.pdf_url LIKE 'db://document/%'
         AND (e.id IS NULL OR e.document_id=d.id) AND d.status='approved' AND d.deleted_at IS NULL AND d.file_data IS NOT NULL
       WHERE i.id=$1 AND i.company_id=$2 AND i.deleted_at IS NULL`,
      [id, user.companyId],
    );
    let status = 'unavailable';
    if (row?.available) status = 'completed';
    else if (['queued', 'dead_letter'].includes(row?.status))
      status = row.status;
    return {
      available: Boolean(row?.available),
      status: status as InvoiceDocumentStatusDto['status'],
    };
  }

  /**
   * Obtiene una factura por su ID.
   * @param id ID de la factura
   * @returns La factura
   */
  async findOne(id: string, companyId: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id, companyId },
      relations: [
        'lease',
        'lease.tenant',
        'lease.property',
        'owner',
        'currency',
      ],
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  async findOneScoped(id: string, user: RequestUser): Promise<Invoice> {
    this.requireCompanyScope(user);
    const query = this.invoicesRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lease', 'lease')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .where('invoice.id = :id', { id })
      .andWhere('invoice.company_id = :companyId', {
        companyId: user.companyId,
      })
      .andWhere('invoice.deleted_at IS NULL');

    this.applyVisibilityScope(query, user);

    const invoice = await query.getOne();
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  /**
   * Lista facturas con filtros.
   * @param filters Filtros
   * @returns Lista paginada
   */
  async findAll(
    filters: {
      leaseId?: string;
      ownerId?: string;
      status?: InvoiceStatus;
      page?: number;
      limit?: number;
      search?: string;
    },
    user: RequestUser,
  ): Promise<{ data: Invoice[]; total: number; page: number; limit: number }> {
    this.requireCompanyScope(user);
    const { leaseId, ownerId, status, search, page = 1, limit = 10 } = filters;

    const query = this.invoicesRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lease', 'lease')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .where('invoice.deleted_at IS NULL')
      .andWhere('invoice.company_id = :companyId', {
        companyId: user.companyId,
      });

    if (leaseId) {
      query.andWhere('invoice.lease_id = :leaseId', { leaseId });
    }

    if (ownerId) {
      query.andWhere('invoice.owner_id = :ownerId', { ownerId });
    }

    if (status) {
      query.andWhere('invoice.status = :status', { status });
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
        "(concat_ws(' ', tenantUser.first_name, tenantUser.last_name) ILIKE :search OR concat_ws(' ', property.name, property.address_street, property.address_city, property.address_state) ILIKE :search OR invoice.invoice_number ILIKE :search)",
        { search: `%${search.trim()}%` },
      );
    this.applyVisibilityScope(query, user);

    query
      .orderBy('invoice.issuedAt', 'DESC')
      .addOrderBy('invoice.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  private applyVisibilityScope(
    query: SelectQueryBuilder<Invoice>,
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

    throw new ForbiddenException('Unsupported invoice access role');
  }

  private requireCompanyScope(user: RequestUser): void {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
  }

  private async applyAdjustmentIfNeeded(
    lease: Lease,
    periodStart: Date,
    apply: boolean,
    manager: EntityManager,
  ) {
    const calculation = await calculateRentAdjustment(
      manager,
      lease,
      periodStart,
      apply,
    );
    if (calculation.snapshot.adjustments.length) {
      lease.monthlyRent = calculation.rent;
      lease.lastAdjustmentDate = new Date(`${calculation.lastDate}T12:00:00Z`);
      lease.nextAdjustmentDate = new Date(`${calculation.nextDate}T12:00:00Z`);
      lease.adjustmentAnchorDate = new Date(`${calculation.anchor}T12:00:00Z`);
      await manager.getRepository(Lease).save(lease);
    }
    return calculation;
  }

  async generateInvoiceNumber(
    companyId: string,
    manager: EntityManager,
  ): Promise<string> {
    return this.generateNumber(manager, companyId, 'invoice');
  }

  private async generateNumber(
    manager: EntityManager,
    companyId: string,
    kind: 'invoice' | 'commission',
  ): Promise<string> {
    if (!companyId) throw new BadRequestException('Company scope required');
    const table = kind === 'invoice' ? 'invoices' : 'commission_invoices';
    const prefix = kind === 'invoice' ? 'INV' : 'COM';
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`${kind}-number:${companyId}`],
    );
    const [row] = await manager.query(
      `SELECT (COALESCE(MAX(substring(invoice_number from $2)::numeric),0)+1)::text AS sequence FROM ${table} WHERE company_id=$1`,
      [companyId, `^${prefix}-[0-9]{6}-([0-9]+)$`],
    );
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
    })
      .format(new Date())
      .replace('-', '');
    return `${prefix}-${month}-${row.sequence.padStart(4, '0')}`;
  }

  private async lockBillingLease(
    manager: EntityManager,
    id: string,
    companyId: string,
  ): Promise<Lease> {
    const repository = manager.getRepository(Lease);
    const lease = await repository.findOne({
      where: { id, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lease) throw new NotFoundException(`Lease with ID ${id} not found`);
    return repository.findOneOrFail({
      where: { id, companyId },
      relations: ['property', 'property.owner'],
    });
  }

  /**
   * Crea la factura de comisión asociada.
   * @param invoice Factura del inquilino
   */
  private async createCommissionInvoice(
    invoice: Invoice,
    manager: EntityManager,
  ): Promise<void> {
    const leasesRepository = manager
      ? manager.getRepository(Lease)
      : this.leasesRepository;
    const commissionInvoicesRepository = manager
      ? manager.getRepository(CommissionInvoice)
      : this.commissionInvoicesRepository;
    const lease = await leasesRepository.findOne({
      where: { id: invoice.leaseId },
      relations: ['property', 'property.company', 'owner'],
    });

    if (!lease?.owner?.commissionRate || !lease.property?.companyId) {
      return; // No hay comisión configurada
    }

    const companyId = lease.property.companyId;
    const commissionRate = Number(lease.owner.commissionRate);
    const baseAmount = Number(invoice.subtotal);
    const taxRate =
      lease.property.company?.settings?.financial?.commissionTaxRate;
    if (taxRate === undefined)
      throw new BadRequestException(
        'Configure the company commission tax rate before issuing commission invoices',
      );
    const rateCents = paymentCents(commissionRate),
      taxRateCents = paymentCents(taxRate);
    if (rateCents > 10000n || taxRateCents > 10000n)
      throw new BadRequestException(
        'Commission and tax rates must be between 0 and 100',
      );
    const commissionAmount = paymentNumber(
      (paymentCents(baseAmount) * rateCents + 5000n) / 10000n,
    );
    const taxAmount = paymentNumber(
      (paymentCents(commissionAmount) * taxRateCents + 5000n) / 10000n,
    );
    const totalAmount = paymentNumber(
      paymentCents(commissionAmount) + paymentCents(taxAmount),
    );

    const invoiceNumber = await this.generateNumber(
      manager,
      companyId,
      'commission',
    );

    // Calcular fechas del período y vencimiento
    const issueDate = new Date();
    const periodStart = invoice.periodStart;
    const periodEnd = invoice.periodEnd;
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 15); // Vence en 15 días

    const commissionInvoice = commissionInvoicesRepository.create({
      companyId,
      ownerId: invoice.ownerId,
      invoiceNumber,
      commissionRate,
      baseAmount,
      commissionAmount,
      taxAmount,
      taxRate: Number(taxRate),
      totalAmount,
      currency: invoice.currencyCode || 'ARS',
      status: CommissionInvoiceStatus.DRAFT,
      issueDate,
      periodStart,
      periodEnd,
      dueDate,
      relatedInvoices: [
        { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
      ],
    });

    await commissionInvoicesRepository.save(commissionInvoice);
  }

  /**
   * Cancela una factura.
   * @param id ID de la factura
   * @returns La factura cancelada
   */
  async cancel(
    id: string,
    companyId: string,
    executionKey?: string,
  ): Promise<Invoice> {
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        'invoice.cancel',
        { id },
        async () => {
          const invoicesRepository = manager.getRepository(Invoice);
          const [account] = await manager.query(
            'SELECT tenant_account_id FROM invoices WHERE id=$1 AND company_id=$2',
            [id, companyId],
          );
          if (account?.tenant_account_id)
            await manager.query(
              'SELECT id FROM tenant_accounts WHERE id=$1 AND company_id=$2 FOR UPDATE',
              [account.tenant_account_id, companyId],
            );
          const invoice = await this.findOneForUpdate(
            invoicesRepository,
            id,
            companyId,
          );

          if (invoice.status === InvoiceStatus.CANCELLED) return invoice;
          await assertNoUncertainSettlementPayout(manager, companyId, id);
          if (invoice.status === InvoiceStatus.REFUNDED)
            throw new BadRequestException(
              'Refunded invoice requires accounting review',
            );

          // Si ya estaba emitida, revertir el movimiento en cuenta
          if (
            [
              InvoiceStatus.PENDING,
              InvoiceStatus.SENT,
              InvoiceStatus.PARTIAL,
              InvoiceStatus.OVERDUE,
              InvoiceStatus.PAID,
            ].includes(invoice.status)
          ) {
            await this.tenantAccountsService.addMovementWithManager(manager, {
              accountId: invoice.tenantAccountId,
              type: MovementType.ADJUSTMENT,
              amount: -Number(invoice.total),
              referenceType: 'invoice',
              referenceId: invoice.id,
              description: `Anulación factura ${invoice.invoiceNumber}`,
              companyId: invoice.companyId,
            });
          }

          const credits = await manager.query(
            `SELECT id,amount::text,note_number,tenant_account_id
            FROM credit_notes WHERE company_id=$1 AND invoice_id=$2 AND status='issued' AND deleted_at IS NULL
            ORDER BY id FOR UPDATE`,
            [companyId, id],
          );
          for (const note of credits) {
            if (note.tenant_account_id)
              await this.tenantAccountsService.addMovementWithManager(manager, {
                accountId: note.tenant_account_id,
                companyId,
                type: MovementType.ADJUSTMENT,
                amount: paymentNumber(paymentCents(note.amount)),
                referenceType: 'credit_note_cancellation',
                referenceId: note.id,
                description: `Anulación nota de crédito ${note.note_number} por factura anulada`,
              });
            await manager.query(
              "UPDATE credit_notes SET status='cancelled',cancelled_at=now() WHERE id=$1 AND company_id=$2",
              [note.id, companyId],
            );
          }
          const commissions = await manager.query(
            `SELECT id,total_amount::text,paid_amount::text,currency,status
            FROM commission_invoices WHERE company_id=$1 AND related_invoices @> $2::jsonb
            AND status <> 'cancelled' AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
            [companyId, JSON.stringify([{ invoiceId: id }])],
          );
          for (const commission of commissions) {
            await manager.query(
              `INSERT INTO commission_invoice_corrections(company_id,commission_invoice_id,invoice_id,amount,currency,paid_amount)
              VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(commission_invoice_id,invoice_id) DO NOTHING`,
              [
                companyId,
                commission.id,
                id,
                commission.total_amount,
                commission.currency,
                commission.paid_amount,
              ],
            );
            await manager.query(
              "UPDATE commission_invoices SET status='cancelled',updated_at=now() WHERE id=$1 AND company_id=$2",
              [commission.id, companyId],
            );
          }
          const originalStatus = invoice.status;
          await manager.query(
            "UPDATE invoices SET status='cancelled',updated_at=now() WHERE id=$1 AND company_id=$2",
            [id, companyId],
          );
          if (paymentCents(invoice.amountPaid ?? 0) > 0n) {
            const [original] = await manager.query(
              `SELECT pa.payment_id FROM payment_allocations pa
              WHERE pa.company_id=$1 AND pa.invoice_id=$2 AND pa.reversed_at IS NULL ORDER BY pa.id LIMIT 1`,
              [companyId, id],
            );
            if (!original)
              throw new ConflictException(
                'Paid invoice without allocation history requires manual cancellation',
              );
            await compensateTransferredAllocation(manager, {
              companyId,
              invoiceId: id,
              paymentId: original.payment_id,
              referenceId: id,
              amount: paymentCents(invoice.amountPaid),
            });
          }
          await manager.query(
            `INSERT INTO invoice_cancellations(company_id,invoice_id,original_status,total_amount,paid_amount,currency)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(invoice_id) DO NOTHING`,
            [
              companyId,
              id,
              originalStatus,
              invoice.total,
              invoice.amountPaid ?? 0,
              invoice.currencyCode ?? 'ARS',
            ],
          );
          invoice.status = InvoiceStatus.CANCELLED;
          return invoicesRepository.save(invoice);
        },
      ),
    );
  }

  private async findOneForUpdate(
    repository: Repository<Invoice>,
    id: string,
    companyId: string,
  ): Promise<Invoice> {
    const invoice = await repository.findOne({
      where: { id, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }
    return invoice;
  }
}
