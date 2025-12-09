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
import { CreateInvoiceDto } from './dto';

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
   * Emite una factura (cambia estado a ISSUED).
   * @param id ID de la factura
   * @returns La factura emitida
   */
  async issue(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be issued');
    }

    invoice.status = InvoiceStatus.ISSUED;
    invoice.issuedAt = new Date();

    const savedInvoice = await this.invoicesRepository.save(invoice);

    // Registrar movimiento en cuenta corriente (aumenta deuda)
    await this.tenantAccountsService.addMovement(
      invoice.tenantAccountId,
      MovementType.INVOICE,
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
      .orderBy('invoice.issued_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
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
    if (invoice.status === InvoiceStatus.ISSUED) {
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
