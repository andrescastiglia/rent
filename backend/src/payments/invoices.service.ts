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
  async create(dto: CreateInvoiceDto, companyId: string): Promise<Invoice> {
    return this.dataSource.transaction(async (manager) => {
      const invoicesRepository = manager.getRepository(Invoice);
      const lease = await this.lockBillingLease(
        manager,
        dto.leaseId,
        companyId,
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
      const total =
        Number(dto.subtotal) +
        Number(dto.lateFee || 0) +
        Number(dto.adjustments || 0);

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
    });
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
        const [receipt] = await manager.query(
          `SELECT result_snapshot, request=$3::jsonb AS matches FROM invoice_generations WHERE company_id=$1 AND idempotency_key=$2`,
          [companyId, key, generationRequest],
        );
        if (receipt) {
          if (!receipt.matches)
            throw new ConflictException(
              'Generation key was already used with a different request',
            );
          if (!receipt.result_snapshot)
            throw new ConflictException(
              'Original execution result unavailable; manual review is required',
            );
          return receipt.result_snapshot as Invoice;
        }
      }
      const lease = await this.lockBillingLease(manager, leaseId, companyId);

      if (key) {
        const [previous] = await manager.query(
          `SELECT invoice_id, result_snapshot, request=$3::jsonb AS matches FROM invoice_generations
           WHERE company_id=$1 AND idempotency_key=$2`,
          [companyId, key, generationRequest],
        );
        if (previous) {
          if (!previous.matches)
            throw new ConflictException(
              'Generation key was already used with a different request',
            );
          if (recoverOriginalResult) {
            if (!previous.result_snapshot)
              throw new ConflictException(
                'Original execution result unavailable; manual review is required',
              );
            return previous.result_snapshot as Invoice;
          }
          const recovered = await invoicesRepository.findOne({
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
      }

      if (scheduled) {
        if (lease.billingFrequency === 'custom' && !lease.billingDay)
          throw new BadRequestException(
            'Custom billing requires a billing day',
          );
        const [eligible] = await manager.query(
          `SELECT l.id FROM leases l WHERE ${SCHEDULED_BILLING_ELIGIBILITY} AND l.id=$2 AND l.company_id=$3`,
          [scheduled.billingDate, leaseId, companyId],
        );
        const expected = computeBillingPeriod(lease, {}, scheduled.billingDate);
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

      const account = await this.tenantAccountsService.findByLease(
        leaseId,
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

      const { periodStart, periodEnd, dueDate } = computeBillingPeriod(
        lease,
        dto,
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

      const subtotal = calculation.rent + Number(lease.additionalExpenses || 0);
      const lateFee =
        dto.applyLateFee === true
          ? await this.tenantAccountsService.calculateLateFee(
              account.id,
              lease.companyId,
              manager,
            )
          : 0;

      const total = subtotal + Number(lateFee || 0);
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

  /**
   * Emite una factura (cambia estado a PENDING).
   * @param id ID de la factura
   * @returns La factura emitida
   */
  async issue(id: string, companyId: string): Promise<Invoice> {
    return this.dataSource.transaction((manager) =>
      this.issueWithManager(manager, id, companyId),
    );
  }

  private async issueWithManager(
    manager: EntityManager,
    id: string,
    companyId: string,
  ): Promise<Invoice> {
    const invoicesRepository = manager.getRepository(Invoice);
    const invoice = await this.findOneForUpdate(
      invoicesRepository,
      id,
      companyId,
    );

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be issued');
    }

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
    return {
      available: Boolean(row?.available),
      status: row?.available
        ? 'completed'
        : ['queued', 'dead_letter'].includes(row?.status)
          ? row.status
          : 'unavailable',
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
    },
    user: RequestUser,
  ): Promise<{ data: Invoice[]; total: number; page: number; limit: number }> {
    this.requireCompanyScope(user);
    const { leaseId, ownerId, status, page = 1, limit = 10 } = filters;

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
    const commissionAmount = (baseAmount * commissionRate) / 100;
    const taxRate = 21; // IVA estándar Argentina
    const taxAmount = (commissionAmount * taxRate) / 100;
    const totalAmount = commissionAmount + taxAmount;

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
  async cancel(id: string, companyId: string): Promise<Invoice> {
    return this.dataSource.transaction(async (manager) => {
      const invoicesRepository = manager.getRepository(Invoice);
      const invoice = await this.findOneForUpdate(
        invoicesRepository,
        id,
        companyId,
      );

      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('Cannot cancel a paid invoice');
      }

      // Si ya estaba emitida, revertir el movimiento en cuenta
      if (
        [
          InvoiceStatus.PENDING,
          InvoiceStatus.SENT,
          InvoiceStatus.PARTIAL,
          InvoiceStatus.OVERDUE,
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

      invoice.status = InvoiceStatus.CANCELLED;
      return invoicesRepository.save(invoice);
    });
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
