import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import * as PDFDocument from 'pdfkit';
import { Owner } from './entities/owner.entity';
import {
  OwnerActivity,
  OwnerActivityStatus,
} from './entities/owner-activity.entity';
import { Property } from '../properties/entities/property.entity';
import { User, UserRole } from '../users/entities/user.entity';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from '../documents/entities/document.entity';
import { DocumentsService } from '../documents/documents.service';
import { CreateOwnerActivityDto } from './dto/create-owner-activity.dto';
import { UpdateOwnerActivityDto } from './dto/update-owner-activity.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { RegisterOwnerSettlementPaymentDto } from './dto/register-owner-settlement-payment.dto';

interface UserContext {
  id: string;
  companyId: string;
  role?: UserRole;
  email?: string | null;
  phone?: string | null;
}

type OwnerSettlementStatus = 'pending' | 'processing' | 'completed' | 'failed';

type OwnerSettlementRow = {
  id: string;
  owner_id: string;
  owner_name: string;
  period: string;
  gross_amount: string | number;
  commission_amount: string | number;
  withholdings_amount: string | number;
  net_amount: string | number;
  status: OwnerSettlementStatus;
  scheduled_date: string | Date | null;
  processed_at: string | Date | null;
  transfer_reference: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  receipt_pdf_url: string | null;
  receipt_name: string | null;
};

export type OwnerSettlementSummary = {
  id: string;
  ownerId: string;
  ownerName: string;
  period: string;
  grossAmount: number;
  commissionAmount: number;
  withholdingsAmount: number;
  netAmount: number;
  status: OwnerSettlementStatus;
  scheduledDate: string | null;
  processedAt: string | null;
  transferReference: string | null;
  notes: string | null;
  receiptPdfUrl: string | null;
  receiptName: string | null;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
    @InjectRepository(OwnerActivity)
    private readonly ownerActivitiesRepository: Repository<OwnerActivity>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly documentsService: DocumentsService,
  ) {}

  /**
   * Get all owners for a company.
   * @param companyId - Company ID
   * @returns List of owners with user data
   */
  async findAll(companyId: string): Promise<Owner[]> {
    return this.ownersRepository.find({
      where: { companyId, deletedAt: IsNull() },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get owner by ID.
   * @param id - Owner ID
   * @param companyId - Company ID for security
   * @returns Owner with user data
   */
  async findOne(id: string, companyId: string): Promise<Owner> {
    const owner = await this.ownersRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!owner) {
      throw new NotFoundException(`Owner with ID ${id} not found`);
    }

    return owner;
  }

  /**
   * Get owner by user ID.
   * @param userId - User ID
   * @param companyId - Company ID for security
   * @returns Owner with user data
   */
  async findByUserId(userId: string, companyId: string): Promise<Owner | null> {
    return this.ownersRepository.findOne({
      where: { userId, companyId, deletedAt: IsNull() },
      relations: ['user'],
    });
  }

  async create(dto: CreateOwnerDto, companyId: string): Promise<Owner> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const password = dto.password?.trim() || randomBytes(16).toString('hex');
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const ownerId = await this.dataSource.transaction(async (manager) => {
      const user = manager.getRepository(User).create({
        companyId,
        role: UserRole.OWNER,
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || undefined,
        isActive: true,
      });

      const savedUser = await manager.getRepository(User).save(user);

      const owner = manager.getRepository(Owner).create({
        userId: savedUser.id,
        companyId,
        taxId: dto.taxId?.trim() || undefined,
        taxIdType: dto.taxIdType?.trim() || undefined,
        address: dto.address?.trim() || undefined,
        city: dto.city?.trim() || undefined,
        state: dto.state?.trim() || undefined,
        country: dto.country?.trim() || undefined,
        postalCode: dto.postalCode?.trim() || undefined,
        bankName: dto.bankName?.trim() || undefined,
        bankAccountType: dto.bankAccountType?.trim() || undefined,
        bankAccountNumber: dto.bankAccountNumber?.trim() || undefined,
        bankCbu: dto.bankCbu?.trim() || undefined,
        bankAlias: dto.bankAlias?.trim() || undefined,
        paymentMethod: dto.paymentMethod,
        commissionRate: dto.commissionRate,
        notes: dto.notes?.trim() || undefined,
      });

      const savedOwner = await manager.getRepository(Owner).save(owner);
      return savedOwner.id;
    });

    return this.findOne(ownerId, companyId);
  }

  async update(
    id: string,
    dto: UpdateOwnerDto,
    companyId: string,
  ): Promise<Owner> {
    const owner = await this.findOne(id, companyId);
    await this.applyOwnerUserUpdates(owner, dto);
    await this.usersRepository.save(owner.user);
    this.applyOwnerProfileUpdates(owner, dto);
    await this.ownersRepository.save(owner);

    return this.findOne(id, companyId);
  }

  private async applyOwnerUserUpdates(
    owner: Owner,
    dto: UpdateOwnerDto,
  ): Promise<void> {
    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== owner.user.email) {
        const existingUser = await this.usersRepository.findOne({
          where: { email: normalizedEmail, deletedAt: IsNull() },
        });
        if (existingUser && existingUser.id !== owner.userId) {
          throw new ConflictException('A user with this email already exists');
        }
      }
      owner.user.email = normalizedEmail;
    }

    this.assignTrimmedIfDefined(owner.user, 'firstName', dto.firstName);
    this.assignTrimmedIfDefined(owner.user, 'lastName', dto.lastName);
    this.assignTrimmedIfDefined(owner.user, 'phone', dto.phone);
  }

  private applyOwnerProfileUpdates(owner: Owner, dto: UpdateOwnerDto): void {
    this.assignTrimmedIfDefined(owner, 'taxId', dto.taxId);
    this.assignTrimmedIfDefined(owner, 'taxIdType', dto.taxIdType);
    this.assignTrimmedIfDefined(owner, 'address', dto.address);
    this.assignTrimmedIfDefined(owner, 'city', dto.city);
    this.assignTrimmedIfDefined(owner, 'state', dto.state);
    this.assignTrimmedIfDefined(owner, 'country', dto.country);
    this.assignTrimmedIfDefined(owner, 'postalCode', dto.postalCode);
    this.assignTrimmedIfDefined(owner, 'bankName', dto.bankName);
    this.assignTrimmedIfDefined(owner, 'bankAccountType', dto.bankAccountType);
    this.assignTrimmedIfDefined(
      owner,
      'bankAccountNumber',
      dto.bankAccountNumber,
    );
    this.assignTrimmedIfDefined(owner, 'bankCbu', dto.bankCbu);
    this.assignTrimmedIfDefined(owner, 'bankAlias', dto.bankAlias);
    this.assignTrimmedIfDefined(owner, 'notes', dto.notes);

    if (dto.paymentMethod !== undefined) {
      owner.paymentMethod = dto.paymentMethod;
    }
    if (dto.commissionRate !== undefined) {
      owner.commissionRate = dto.commissionRate;
    }
  }

  private assignTrimmedIfDefined<
    T extends object,
    K extends Extract<keyof T, string>,
  >(target: T, key: K, value: unknown): void {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] =
        typeof value === 'string' ? value.trim() : value;
    }
  }

  async listSettlements(
    ownerId: string,
    companyId: string,
    user: UserContext,
    status: 'all' | 'pending' | 'completed' = 'all',
    limit = 12,
  ): Promise<OwnerSettlementSummary[]> {
    await this.assertOwnerAccess(ownerId, companyId, user);

    const params: Array<string | number> = [companyId, ownerId];
    const where: string[] = ['s.owner_id = $2'];

    if (status === 'pending') {
      params.push('completed');
      where.push(`s.status <> $${params.length}`);
    } else if (status === 'completed') {
      params.push('completed');
      where.push(`s.status = $${params.length}`);
    }

    params.push(Math.max(1, Math.min(100, limit)));

    const rows = await this.dataSource.query(
      `SELECT
          s.id,
          s.owner_id,
          COALESCE(NULLIF(TRIM(owner_user.first_name || ' ' || owner_user.last_name), ''), owner_user.email) AS owner_name,
          s.period,
          s.gross_amount,
          s.commission_amount,
          s.withholdings_amount,
          s.net_amount,
          s.status,
          s.scheduled_date,
          s.processed_at,
          s.transfer_reference,
          s.notes,
          s.created_at,
          s.updated_at,
          rd.file_url AS receipt_pdf_url,
          rd.name AS receipt_name
       FROM settlements s
       INNER JOIN owners owner_entity
         ON owner_entity.id = s.owner_id
        AND owner_entity.company_id = $1
        AND owner_entity.deleted_at IS NULL
       INNER JOIN users owner_user
         ON owner_user.id = owner_entity.user_id
       LEFT JOIN LATERAL (
         SELECT d.file_url, d.name
           FROM documents d
          WHERE d.entity_type = 'owner_settlement'
            AND d.entity_id = s.id
            AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
          LIMIT 1
       ) rd ON TRUE
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(s.processed_at, s.scheduled_date, s.created_at) DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row: OwnerSettlementRow) => this.mapSettlement(row));
  }

  async listSettlementPayments(
    companyId: string,
    user: UserContext,
    limit = 100,
  ): Promise<OwnerSettlementSummary[]> {
    const params: Array<string | number> = [companyId];
    const ownerScope = await this.getOwnerScopeCondition(user, params);

    params.push('completed');
    params.push(Math.max(1, Math.min(500, limit)));

    const rows = await this.dataSource.query(
      `SELECT
          s.id,
          s.owner_id,
          COALESCE(NULLIF(TRIM(owner_user.first_name || ' ' || owner_user.last_name), ''), owner_user.email) AS owner_name,
          s.period,
          s.gross_amount,
          s.commission_amount,
          s.withholdings_amount,
          s.net_amount,
          s.status,
          s.scheduled_date,
          s.processed_at,
          s.transfer_reference,
          s.notes,
          s.created_at,
          s.updated_at,
          rd.file_url AS receipt_pdf_url,
          rd.name AS receipt_name
       FROM settlements s
       INNER JOIN owners owner_entity
         ON owner_entity.id = s.owner_id
        AND owner_entity.company_id = $1
        AND owner_entity.deleted_at IS NULL
       INNER JOIN users owner_user
         ON owner_user.id = owner_entity.user_id
       LEFT JOIN LATERAL (
         SELECT d.file_url, d.name
           FROM documents d
          WHERE d.entity_type = 'owner_settlement'
            AND d.entity_id = s.id
            AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
          LIMIT 1
       ) rd ON TRUE
       WHERE s.status = $${params.length - 1}
         ${ownerScope}
       ORDER BY COALESCE(s.processed_at, s.updated_at, s.created_at) DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row: OwnerSettlementRow) => this.mapSettlement(row));
  }

  async registerSettlementPayment(
    ownerId: string,
    settlementId: string,
    dto: RegisterOwnerSettlementPaymentDto,
    user: UserContext,
  ): Promise<OwnerSettlementSummary> {
    const owner = await this.assertOwnerAccess(ownerId, user.companyId, user);

    const rows = await this.dataSource.query(
      `SELECT
          s.id,
          s.owner_id,
          COALESCE(NULLIF(TRIM(owner_user.first_name || ' ' || owner_user.last_name), ''), owner_user.email) AS owner_name,
          s.period,
          s.gross_amount,
          s.commission_amount,
          s.withholdings_amount,
          s.net_amount,
          s.status,
          s.scheduled_date,
          s.processed_at,
          s.transfer_reference,
          s.notes,
          s.created_at,
          s.updated_at,
          rd.file_url AS receipt_pdf_url,
          rd.name AS receipt_name
       FROM settlements s
       INNER JOIN owners owner_entity
         ON owner_entity.id = s.owner_id
        AND owner_entity.company_id = $1
        AND owner_entity.deleted_at IS NULL
       INNER JOIN users owner_user
         ON owner_user.id = owner_entity.user_id
       LEFT JOIN LATERAL (
         SELECT d.file_url, d.name
           FROM documents d
          WHERE d.entity_type = 'owner_settlement'
            AND d.entity_id = s.id
            AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
          LIMIT 1
       ) rd ON TRUE
       WHERE s.id = $2
         AND s.owner_id = $3
       LIMIT 1`,
      [user.companyId, settlementId, ownerId],
    );

    const settlement = rows[0] as OwnerSettlementRow | undefined;
    if (!settlement) {
      throw new NotFoundException('Settlement not found for owner');
    }

    if (settlement.status === 'completed' && settlement.receipt_pdf_url) {
      return this.mapSettlement(settlement);
    }

    if (dto.amount !== undefined) {
      const expected = Number(settlement.net_amount);
      if (Math.abs(Number(dto.amount) - expected) > 0.01) {
        throw new BadRequestException(
          'Settlement payment amount must match net settlement amount',
        );
      }
    }

    const processedAt = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    if (Number.isNaN(processedAt.getTime())) {
      throw new BadRequestException('Invalid paymentDate');
    }

    await this.dataSource.query(
      `UPDATE settlements
          SET status = 'completed',
              processed_at = $2,
              transfer_reference = COALESCE(NULLIF($3, ''), transfer_reference),
              notes = CASE
                WHEN NULLIF($4, '') IS NULL THEN notes
                ELSE NULLIF($4, '')
              END,
              updated_at = NOW()
        WHERE id = $1`,
      [
        settlementId,
        processedAt.toISOString(),
        dto.reference ?? null,
        dto.notes ?? null,
      ],
    );

    const receiptBuffer = await this.generateSettlementReceiptBuffer({
      settlementId: settlement.id,
      ownerName: settlement.owner_name,
      period: settlement.period,
      netAmount: Number(settlement.net_amount),
      grossAmount: Number(settlement.gross_amount),
      commissionAmount: Number(settlement.commission_amount),
      withholdingsAmount: Number(settlement.withholdings_amount),
      processedAt,
      reference: dto.reference ?? settlement.transfer_reference ?? '',
      notes: dto.notes ?? settlement.notes ?? '',
    });

    const receiptName = `recibo-liquidacion-${settlement.period}-${settlement.id.slice(0, 8)}.pdf`;
    const savedDocument = await this.documentsRepository.save(
      this.documentsRepository.create({
        companyId: owner.companyId,
        entityType: 'owner_settlement',
        entityId: settlement.id,
        documentType: DocumentType.OTHER,
        status: DocumentStatus.APPROVED,
        name: receiptName,
        description: `Recibo de liquidación ${settlement.period} - ${settlement.owner_name}`,
        fileUrl: 'db://document/pending',
        fileMimeType: 'application/pdf',
        fileSize: receiptBuffer.length,
        fileData: receiptBuffer,
        metadata: {
          source: 'owners.settlement.payment',
          ownerId,
          period: settlement.period,
        },
      }),
    );

    savedDocument.fileUrl = `db://document/${savedDocument.id}`;
    await this.documentsRepository.save(savedDocument);

    const updatedRows = await this.dataSource.query(
      `SELECT
          s.id,
          s.owner_id,
          COALESCE(NULLIF(TRIM(owner_user.first_name || ' ' || owner_user.last_name), ''), owner_user.email) AS owner_name,
          s.period,
          s.gross_amount,
          s.commission_amount,
          s.withholdings_amount,
          s.net_amount,
          s.status,
          s.scheduled_date,
          s.processed_at,
          s.transfer_reference,
          s.notes,
          s.created_at,
          s.updated_at,
          rd.file_url AS receipt_pdf_url,
          rd.name AS receipt_name
       FROM settlements s
       INNER JOIN owners owner_entity
         ON owner_entity.id = s.owner_id
        AND owner_entity.company_id = $1
        AND owner_entity.deleted_at IS NULL
       INNER JOIN users owner_user
         ON owner_user.id = owner_entity.user_id
       LEFT JOIN LATERAL (
         SELECT d.file_url, d.name
           FROM documents d
          WHERE d.entity_type = 'owner_settlement'
            AND d.entity_id = s.id
            AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
          LIMIT 1
       ) rd ON TRUE
       WHERE s.id = $2
       LIMIT 1`,
      [owner.companyId, settlement.id],
    );

    const updated = updatedRows[0] as OwnerSettlementRow | undefined;
    if (!updated) {
      throw new NotFoundException('Updated settlement not found');
    }

    return this.mapSettlement(updated);
  }

  async getSettlementReceipt(
    settlementId: string,
    companyId: string,
    user: UserContext,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const params: Array<string> = [companyId, settlementId];
    const ownerScope = await this.getOwnerScopeCondition(user, params);

    const rows = await this.dataSource.query(
      `SELECT
          s.id,
          s.period,
          rd.file_url AS receipt_pdf_url,
          rd.name AS receipt_name
       FROM settlements s
       INNER JOIN owners owner_entity
         ON owner_entity.id = s.owner_id
        AND owner_entity.company_id = $1
        AND owner_entity.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT d.file_url, d.name
           FROM documents d
          WHERE d.entity_type = 'owner_settlement'
            AND d.entity_id = s.id
            AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
          LIMIT 1
       ) rd ON TRUE
       WHERE s.id = $2
         ${ownerScope}
       LIMIT 1`,
      params,
    );

    const row = rows[0] as
      | {
          id: string;
          period: string;
          receipt_pdf_url: string | null;
          receipt_name: string | null;
        }
      | undefined;

    if (!row) {
      throw new NotFoundException('Settlement not found');
    }
    if (!row.receipt_pdf_url) {
      throw new NotFoundException('Settlement receipt not found');
    }

    const file = await this.documentsService.downloadByS3Key(
      row.receipt_pdf_url,
    );
    return {
      ...file,
      filename:
        row.receipt_name ??
        `recibo-liquidacion-${row.period}-${row.id.slice(0, 8)}.pdf`,
    };
  }

  async listActivities(
    ownerId: string,
    companyId: string,
  ): Promise<OwnerActivity[]> {
    await this.findOne(ownerId, companyId);

    return this.ownerActivitiesRepository.find({
      where: {
        ownerId,
        companyId,
        deletedAt: IsNull(),
      },
      relations: ['property'],
      order: { createdAt: 'DESC' },
    });
  }

  async createActivity(
    ownerId: string,
    dto: CreateOwnerActivityDto,
    user: UserContext,
  ): Promise<OwnerActivity> {
    await this.findOne(ownerId, user.companyId);

    if (dto.propertyId) {
      const property = await this.propertiesRepository.findOne({
        where: {
          id: dto.propertyId,
          ownerId,
          companyId: user.companyId,
          deletedAt: IsNull(),
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found for this owner');
      }
    }

    const activity = this.ownerActivitiesRepository.create({
      companyId: user.companyId,
      ownerId,
      propertyId: dto.propertyId ?? null,
      type: dto.type,
      status: dto.status ?? OwnerActivityStatus.PENDING,
      subject: dto.subject,
      body: dto.body ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      metadata: dto.metadata ?? {},
      createdByUserId: user.id,
    });

    if (
      activity.status === OwnerActivityStatus.COMPLETED &&
      !activity.completedAt
    ) {
      activity.completedAt = new Date();
    }

    return this.ownerActivitiesRepository.save(activity);
  }

  async updateActivity(
    ownerId: string,
    activityId: string,
    dto: UpdateOwnerActivityDto,
    companyId: string,
  ): Promise<OwnerActivity> {
    await this.findOne(ownerId, companyId);

    const activity = await this.ownerActivitiesRepository.findOne({
      where: { id: activityId, ownerId, companyId, deletedAt: IsNull() },
    });

    if (!activity) {
      throw new NotFoundException(
        `Owner activity with ID ${activityId} not found`,
      );
    }

    if (dto.propertyId) {
      const property = await this.propertiesRepository.findOne({
        where: {
          id: dto.propertyId,
          ownerId,
          companyId,
          deletedAt: IsNull(),
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found for this owner');
      }
    }

    Object.assign(activity, {
      ...dto,
      propertyId: dto.propertyId ?? activity.propertyId,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : activity.dueAt,
      completedAt: dto.completedAt
        ? new Date(dto.completedAt)
        : activity.completedAt,
    });

    if (dto.status === OwnerActivityStatus.COMPLETED && !activity.completedAt) {
      activity.completedAt = new Date();
    }

    return this.ownerActivitiesRepository.save(activity);
  }

  private mapSettlement(row: OwnerSettlementRow): OwnerSettlementSummary {
    return {
      id: row.id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      period: row.period,
      grossAmount: Number(row.gross_amount ?? 0),
      commissionAmount: Number(row.commission_amount ?? 0),
      withholdingsAmount: Number(row.withholdings_amount ?? 0),
      netAmount: Number(row.net_amount ?? 0),
      status: row.status,
      scheduledDate: row.scheduled_date
        ? new Date(row.scheduled_date).toISOString()
        : null,
      processedAt: row.processed_at
        ? new Date(row.processed_at).toISOString()
        : null,
      transferReference: row.transfer_reference,
      notes: row.notes,
      receiptPdfUrl: row.receipt_pdf_url,
      receiptName: row.receipt_name,
      currencyCode: 'ARS',
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async assertOwnerAccess(
    ownerId: string,
    companyId: string,
    user: UserContext,
  ): Promise<Owner> {
    const owner = await this.findOne(ownerId, companyId);
    if (user.role === UserRole.OWNER && owner.userId !== user.id) {
      throw new ForbiddenException('You can only access your own settlements');
    }
    return owner;
  }

  private async getOwnerScopeCondition(
    user: UserContext,
    params: Array<string | number>,
  ): Promise<string> {
    if (user.role !== UserRole.OWNER) {
      return '';
    }

    params.push(user.id);
    return `AND owner_entity.user_id = $${params.length}`;
  }

  private async generateSettlementReceiptBuffer(input: {
    settlementId: string;
    ownerName: string;
    period: string;
    grossAmount: number;
    commissionAmount: number;
    withholdingsAmount: number;
    netAmount: number;
    processedAt: Date;
    reference: string;
    notes: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const PDFCtor = (PDFDocument as any).default ?? (PDFDocument as any);
      const doc = new PDFCtor({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer | Uint8Array) =>
        chunks.push(Buffer.from(chunk)),
      );
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('Recibo de liquidacion al propietario', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica');
      doc.text(`Propietario: ${input.ownerName}`);
      doc.text(`Periodo: ${input.period}`);
      doc.text(
        `Fecha de pago: ${input.processedAt.toISOString().slice(0, 10)}`,
      );
      doc.text(`Referencia: ${input.reference || '-'}`);
      doc.moveDown();
      doc.text(`Bruto: ARS ${input.grossAmount.toLocaleString('es-AR')}`);
      doc.text(
        `Comision: ARS ${input.commissionAmount.toLocaleString('es-AR')}`,
      );
      doc.text(
        `Retenciones: ARS ${input.withholdingsAmount.toLocaleString('es-AR')}`,
      );
      doc
        .font('Helvetica-Bold')
        .text(`Neto pagado: ARS ${input.netAmount.toLocaleString('es-AR')}`);
      doc.font('Helvetica');
      if (input.notes) {
        doc.moveDown();
        doc.text(`Notas: ${input.notes}`);
      }
      doc.moveDown(2);
      doc.fontSize(8).text(`Liquidacion ID: ${input.settlementId}`, {
        align: 'center',
      });
      doc.end();
    });
  }
}
