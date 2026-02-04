import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import {
  CommissionInvoice,
  CommissionInvoiceStatus,
} from './entities/commission-invoice.entity';
import { Lease } from '../leases/entities/lease.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { MovementType } from './entities/tenant-account-movement.entity';
import { CreateInvoiceDto, GenerateInvoiceDto } from './dto';
import { InflationIndex } from './entities/inflation-index.entity';
import { InflationIndexType as IndexTypeEntity } from './entities/inflation-index.entity';
import { AdjustmentType, InflationIndexType } from '../leases/entities/lease.entity';

/**
 * Servicio para gestionar facturas.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoicesRepository: Repository<Invoice>,
    @InjectRepository(CommissionInvoice)
    private commissionInvoicesRepository: Repository<CommissionInvoice>,
    @InjectRepository(Lease)
    private leasesRepository: Repository<Lease>,
    @InjectRepository(InflationIndex)
    private inflationIndexRepository: Repository<InflationIndex>,
    private tenantAccountsService: TenantAccountsService,
  ) {}

  /**
   * Crea una factura para un contrato.
   * @param dto Datos de la factura
   * @returns La factura creada
   */
  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const lease = await this.leasesRepository.findOne({
      where: { id: dto.leaseId },
      relations: ['unit', 'unit.property', 'unit.property.owner'],
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${dto.leaseId} not found`);
    }

    // Obtener o crear cuenta del inquilino
    const account = await this.tenantAccountsService.findByLease(dto.leaseId);

    // Obtener propietario
    const ownerId = lease.unit?.property?.ownerId;
    if (!ownerId) {
      throw new BadRequestException('Property owner not found for this lease');
    }

    // Calcular total
    const total =
      Number(dto.subtotal) +
      Number(dto.lateFee || 0) +
      Number(dto.adjustments || 0);

    // Generar número de factura si no se proporciona
    const invoiceNumber =
      dto.invoiceNumber || (await this.generateInvoiceNumber(ownerId));

    const invoice = this.invoicesRepository.create({
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

    return this.invoicesRepository.save(invoice);
  }

  /**
   * Genera una factura mensual con fechas automáticas.
   */
  async generateForLease(
    leaseId: string,
    dto: GenerateInvoiceDto,
  ): Promise<Invoice> {
    const lease = await this.leasesRepository.findOne({
      where: { id: leaseId },
      relations: ['unit', 'unit.property', 'unit.property.owner'],
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${leaseId} not found`);
    }

    const account = await this.tenantAccountsService.findByLease(leaseId);

    const { periodStart, periodEnd, dueDate } =
      this.computeBillingPeriod(lease, dto);

    const baseRent = await this.applyAdjustmentIfNeeded(
      lease,
      periodStart,
      dto.applyAdjustment !== false,
    );

    const subtotal = Number(baseRent) + Number(lease.additionalExpenses || 0);
    const lateFee =
      dto.applyLateFee === true
        ? await this.tenantAccountsService.calculateLateFee(account.id)
        : 0;

    const total = subtotal + Number(lateFee || 0);

    const invoiceNumber = await this.generateInvoiceNumber(lease.ownerId);

    const invoice = this.invoicesRepository.create({
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
    });

    const saved = await this.invoicesRepository.save(invoice);

    lease.lastBillingDate = periodStart;
    lease.nextBillingDate = this.addDays(periodEnd, 1);
    await this.leasesRepository.save(lease);

    if (dto.issue) {
      return this.issue(saved.id);
    }

    return saved;
  }

  /**
   * Emite una factura (cambia estado a PENDING).
   * @param id ID de la factura
   * @returns La factura emitida
   */
  async issue(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be issued');
    }

    invoice.status = InvoiceStatus.PENDING;
    invoice.issuedAt = new Date();

    const savedInvoice = await this.invoicesRepository.save(invoice);

    // Registrar movimiento en cuenta corriente (aumenta deuda)
    await this.tenantAccountsService.addMovement(
      invoice.tenantAccountId,
      MovementType.CHARGE,
      Number(invoice.total),
      'invoice',
      invoice.id,
      `Factura ${invoice.invoiceNumber}`,
    );

    // Crear factura de comisión si aplica
    await this.createCommissionInvoice(savedInvoice);

    return savedInvoice;
  }

  /**
   * Obtiene una factura por su ID.
   * @param id ID de la factura
   * @returns La factura
   */
  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({
      where: { id },
      relations: [
        'lease',
        'lease.tenant',
        'lease.unit',
        'lease.unit.property',
        'owner',
        'currency',
      ],
    });

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
  async findAll(filters: {
    leaseId?: string;
    ownerId?: string;
    status?: InvoiceStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: Invoice[]; total: number; page: number; limit: number }> {
    const { leaseId, ownerId, status, page = 1, limit = 10 } = filters;

    const query = this.invoicesRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lease', 'lease')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .where('invoice.deleted_at IS NULL');

    if (leaseId) {
      query.andWhere('invoice.lease_id = :leaseId', { leaseId });
    }

    if (ownerId) {
      query.andWhere('invoice.owner_id = :ownerId', { ownerId });
    }

    if (status) {
      query.andWhere('invoice.status = :status', { status });
    }

    query
      .orderBy('invoice.issuedAt', 'DESC')
      .addOrderBy('invoice.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  private computeBillingPeriod(
    lease: Lease,
    dto: GenerateInvoiceDto,
  ): { periodStart: Date; periodEnd: Date; dueDate: Date } {
    if (dto.periodStart && dto.periodEnd && dto.dueDate) {
      return {
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        dueDate: new Date(dto.dueDate),
      };
    }

    const start = lease.nextBillingDate
      ? new Date(lease.nextBillingDate)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const months = this.getFrequencyMonths(lease.paymentFrequency);
    const end = this.addDays(this.addMonths(start, months), -1);

    const due = new Date(start);
    due.setDate(lease.paymentDueDay || 10);
    if (due < start) {
      due.setMonth(due.getMonth() + 1);
    }

    return { periodStart: start, periodEnd: end, dueDate: due };
  }

  private async applyAdjustmentIfNeeded(
    lease: Lease,
    periodStart: Date,
    apply: boolean,
  ): Promise<number> {
    if (!apply || !lease.nextAdjustmentDate) {
      return Number(lease.monthlyRent);
    }

    const nextAdjustment = new Date(lease.nextAdjustmentDate);
    if (periodStart < nextAdjustment) {
      return Number(lease.monthlyRent);
    }

    let newRent = Number(lease.monthlyRent);

    if (lease.adjustmentType === AdjustmentType.FIXED) {
      newRent += Number(lease.adjustmentValue || 0);
    } else if (lease.adjustmentType === AdjustmentType.PERCENTAGE) {
      newRent += newRent * (Number(lease.adjustmentValue || 0) / 100);
    } else if (
      lease.adjustmentType === AdjustmentType.INFLATION_INDEX &&
      lease.inflationIndexType
    ) {
      const index = await this.findLatestIndex(lease.inflationIndexType);
      if (index?.variationMonthly) {
        newRent += newRent * (Number(index.variationMonthly) / 100);
      }
    }

    lease.monthlyRent = Number(newRent.toFixed(2));
    lease.lastAdjustmentDate = periodStart;
    lease.nextAdjustmentDate = this.addMonths(
      periodStart,
      lease.adjustmentFrequencyMonths || 12,
    );
    await this.leasesRepository.save(lease);

    return Number(lease.monthlyRent);
  }

  private async findLatestIndex(type: InflationIndexType) {
    let mapped = IndexTypeEntity.ICL;
    if (type === InflationIndexType.IGP_M) {
      mapped = IndexTypeEntity.IGPM;
    } else if (type === InflationIndexType.IPC) {
      mapped = IndexTypeEntity.IPC;
    } else if (type === InflationIndexType.CASA_PROPIA) {
      mapped = IndexTypeEntity.CASA_PROPIA;
    } else if (type === InflationIndexType.CUSTOM) {
      mapped = IndexTypeEntity.CUSTOM;
    }

    return this.inflationIndexRepository.findOne({
      where: { indexType: mapped },
      order: { periodDate: 'DESC' },
    });
  }

  private getFrequencyMonths(frequency: any): number {
    switch (frequency) {
      case 'bimonthly':
        return 2;
      case 'quarterly':
        return 3;
      case 'semiannual':
        return 6;
      case 'annual':
        return 12;
      case 'monthly':
      default:
        return 1;
    }
  }

  private addMonths(date: Date, months: number): Date {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /**
   * Genera un número de factura para un propietario.
   * @param ownerId ID del propietario
   * @returns Número de factura
   */
  async generateInvoiceNumber(ownerId: string): Promise<string> {
    // Obtener el último número de factura del propietario
    const lastInvoice = await this.invoicesRepository.findOne({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length >= 3) {
        sequence = parseInt(parts[parts.length - 1], 10) + 1;
      }
    }

    return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Crea la factura de comisión asociada.
   * @param invoice Factura del inquilino
   */
  private async createCommissionInvoice(invoice: Invoice): Promise<void> {
    const lease = await this.leasesRepository.findOne({
      where: { id: invoice.leaseId },
      relations: ['unit', 'unit.property', 'unit.property.company', 'owner'],
    });

    if (!lease?.owner?.commissionRate || !lease.unit?.property?.companyId) {
      return; // No hay comisión configurada
    }

    const companyId = lease.unit.property.companyId;
    const commissionRate = Number(lease.owner.commissionRate);
    const baseAmount = Number(invoice.subtotal);
    const commissionAmount = (baseAmount * commissionRate) / 100;
    const taxRate = 21.0; // IVA estándar Argentina
    const taxAmount = (commissionAmount * taxRate) / 100;
    const totalAmount = commissionAmount + taxAmount;

    const invoiceNumber = await this.generateCommissionInvoiceNumber(companyId);

    // Calcular fechas del período y vencimiento
    const issueDate = new Date();
    const periodStart = invoice.periodStart;
    const periodEnd = invoice.periodEnd;
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 15); // Vence en 15 días

    const commissionInvoice = this.commissionInvoicesRepository.create({
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

    await this.commissionInvoicesRepository.save(commissionInvoice);
  }

  /**
   * Genera número de factura de comisión.
   * @param companyId ID de la compañía
   * @returns Número de factura
   */
  private async generateCommissionInvoiceNumber(
    companyId: string,
  ): Promise<string> {
    const lastInvoice = await this.commissionInvoicesRepository.findOne({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    let sequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length >= 3) {
        sequence = parseInt(parts[parts.length - 1], 10) + 1;
      }
    }

    return `COM-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Cancela una factura.
   * @param id ID de la factura
   * @returns La factura cancelada
   */
  async cancel(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);

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
      await this.tenantAccountsService.addMovement(
        invoice.tenantAccountId,
        MovementType.ADJUSTMENT,
        -Number(invoice.total),
        'invoice',
        invoice.id,
        `Anulación factura ${invoice.invoiceNumber}`,
      );
    }

    invoice.status = InvoiceStatus.CANCELLED;
    return this.invoicesRepository.save(invoice);
  }
}
