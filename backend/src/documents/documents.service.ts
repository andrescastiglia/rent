import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from './entities/document.entity';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';

export type DocumentActor = {
  id: string;
  companyId?: string;
  role: UserRole;
  roles?: UserRole[];
};

const UPLOAD_ENTITY_TABLES: Record<string, string> = {
  property: 'properties',
  properties: 'properties',
  unit: 'units',
  units: 'units',
  lease: 'leases',
  leases: 'leases',
  contract: 'leases',
  contracts: 'leases',
  tenant: 'tenants',
  tenants: 'tenants',
  owner: 'owners',
  owners: 'owners',
  maintenance: 'maintenance_tickets',
  maintenance_ticket: 'maintenance_tickets',
};

const CANONICAL_ENTITY_TYPES: Record<string, string> = {
  properties: 'property',
  units: 'unit',
  leases: 'lease',
  contract: 'lease',
  contracts: 'lease',
  tenants: 'tenant',
  owners: 'owner',
  maintenance: 'maintenance_ticket',
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async generateUploadUrl(
    dto: GenerateUploadUrlDto,
    actor: DocumentActor,
  ): Promise<{ uploadUrl: string; documentId: string }> {
    const companyId = this.requireCompanyId(actor);
    await this.assertEntityAccessible(dto.entityType, dto.entityId, actor);
    // Validate file size based on type
    const maxSize =
      dto.documentType === DocumentType.PHOTO ? 5242880 : 10485760; // 5MB for photos, 10MB for docs
    if (
      !Number.isSafeInteger(dto.fileSize) ||
      dto.fileSize < 1 ||
      dto.fileSize > maxSize
    ) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${maxSize / 1048576}MB)`,
      );
    }

    // Validate mime type by document category
    const allowedMimeTypes: Record<string, string[]> = {
      [DocumentType.LEASE_CONTRACT]: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [DocumentType.ID_DOCUMENT]: [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ],
      [DocumentType.PROOF_OF_INCOME]: [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ],
      [DocumentType.BANK_STATEMENT]: ['application/pdf'],
      [DocumentType.UTILITY_BILL]: [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ],
      [DocumentType.INSURANCE]: ['application/pdf'],
      [DocumentType.INSPECTION_REPORT]: [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ],
      [DocumentType.MAINTENANCE_RECORD]: [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ],
      [DocumentType.PHOTO]: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ],
      [DocumentType.OTHER]: ['application/pdf', 'image/jpeg', 'image/png'],
    };

    if (!allowedMimeTypes[dto.documentType]?.includes(dto.mimeType)) {
      throw new BadRequestException(
        `Invalid mime type for document type ${dto.documentType}`,
      );
    }

    const entityType = this.normalizeEntityType(dto.entityType);
    const id = randomUUID();
    const fileUrl = `db://document/${id}`;

    // Create document record
    const document = this.documentsRepository.create({
      id,
      companyId,
      entityType,
      entityId: dto.entityId,
      documentType: dto.documentType,
      name: dto.fileName,
      fileUrl,
      fileMimeType: dto.mimeType,
      fileSize: dto.fileSize,
      status: DocumentStatus.PENDING,
    });

    const savedDocument = await this.documentsRepository.save(document);

    return {
      uploadUrl: this.createContentUrl(savedDocument.id, 'upload', actor),
      documentId: savedDocument.id,
    };
  }

  async generateDownloadUrl(
    documentId: string,
    actor: DocumentActor,
  ): Promise<{ downloadUrl: string }> {
    const companyId = this.requireCompanyId(actor);
    const document = await this.documentsRepository.findOne({
      where: {
        id: documentId,
        companyId,
        status: DocumentStatus.APPROVED,
      },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }
    await this.assertEntityAccessible(
      document.entityType,
      document.entityId,
      actor,
    );

    return {
      downloadUrl: this.createContentUrl(document.id, 'download', actor),
    };
  }

  // A capability is scoped to one operation, document and actor for five minutes.
  // The parent relationship is checked again when the URL is used.
  private createContentUrl(
    id: string,
    operation: 'upload' | 'download',
    actor: DocumentActor,
  ): string {
    const payload = Buffer.from(
      JSON.stringify({
        id,
        operation,
        actor: {
          id: actor.id,
          companyId: actor.companyId,
          role: actor.role,
          roles: actor.roles,
        },
        expires: Date.now() + 300_000,
      }),
    ).toString('base64url');
    const signature = this.signContentToken(payload);
    const configuredBase = this.configService.get<string>(
      'NEXT_PUBLIC_API_URL',
    );
    const base = configuredBase?.startsWith('http')
      ? configuredBase
      : `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/api`;
    return `${base.replace(/\/$/, '')}/documents/${id}/content?token=${payload}.${signature}`;
  }

  private signContentToken(payload: string): string {
    return createHmac(
      'sha256',
      this.configService.getOrThrow<string>('JWT_SECRET'),
    )
      .update(`document-content:${payload}`)
      .digest('base64url');
  }

  private verifyContentToken(
    id: string,
    operation: 'upload' | 'download',
    token?: string,
  ): DocumentActor {
    try {
      if (typeof token !== 'string' || !token || token.length > 4096)
        throw new Error();
      const [payload, signature, extra] = token.split('.');
      const expected = Buffer.from(this.signContentToken(payload));
      const supplied = Buffer.from(signature ?? '');
      if (
        extra ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        throw new Error();
      const claim = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (
        claim.id !== id ||
        claim.operation !== operation ||
        !Number.isFinite(claim.expires) ||
        claim.expires <= Date.now() ||
        !claim.actor?.id ||
        !claim.actor?.companyId
      )
        throw new Error();
      return claim.actor as DocumentActor;
    } catch {
      throw new ForbiddenException('Invalid or expired document link');
    }
  }

  async uploadContent(
    id: string,
    token: string | undefined,
    buffer: Buffer,
    contentType: string | undefined,
  ): Promise<void> {
    const actor = this.verifyContentToken(id, 'upload', token);
    const document = await this.documentsRepository.findOne({
      where: { id, companyId: actor.companyId, status: DocumentStatus.PENDING },
    });
    if (!document) throw new NotFoundException('Pending document not found');
    await this.assertEntityAccessible(
      document.entityType,
      document.entityId,
      actor,
    );
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.byteLength === 0 ||
      buffer.byteLength > 10485760 ||
      buffer.byteLength !== document.fileSize ||
      contentType !== document.fileMimeType
    ) {
      throw new BadRequestException(
        'Uploaded content does not match declared size and MIME type',
      );
    }
    // A conditional update prevents an upload racing with confirmation from
    // overwriting already approved bytes.
    const result = await this.documentsRepository.update(
      { id, companyId: actor.companyId, status: DocumentStatus.PENDING },
      { fileData: buffer },
    );
    if (!result.affected)
      throw new BadRequestException('Document is no longer pending');
  }

  async downloadContent(
    id: string,
    token?: string,
  ): Promise<{ buffer: Buffer; contentType: string; name: string }> {
    const actor = this.verifyContentToken(id, 'download', token);
    const document = await this.documentsRepository.findOne({
      where: {
        id,
        companyId: actor.companyId,
        status: DocumentStatus.APPROVED,
      },
      select: [
        'id',
        'entityType',
        'entityId',
        'fileData',
        'fileMimeType',
        'name',
      ],
    });
    if (!document?.fileData)
      throw new NotFoundException('Document content not found');
    await this.assertEntityAccessible(
      document.entityType,
      document.entityId,
      actor,
    );
    return {
      buffer: Buffer.from(document.fileData),
      contentType: document.fileMimeType,
      name: document.name,
    };
  }

  async confirmUpload(
    documentId: string,
    actor: DocumentActor,
  ): Promise<Document> {
    const companyId = this.requireCompanyId(actor);
    const document = await this.documentsRepository.findOne({
      where: { id: documentId, companyId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }
    await this.assertEntityAccessible(
      document.entityType,
      document.entityId,
      actor,
    );

    if (document.status === DocumentStatus.APPROVED) {
      return document;
    }
    if (document.status !== DocumentStatus.PENDING) {
      throw new BadRequestException('Document is not pending');
    }
    // Validate and approve in one statement so a concurrent PUT cannot change
    // the content after the approval check. Never return binary data in JSON.
    const result = await this.documentsRepository
      .createQueryBuilder()
      .update(Document)
      .set({
        status: DocumentStatus.APPROVED,
        verifiedBy: actor.id,
        verifiedAt: new Date(),
      })
      .where('id = :id AND company_id = :companyId AND status = :status', {
        id: documentId,
        companyId,
        status: DocumentStatus.PENDING,
      })
      .andWhere('file_data IS NOT NULL AND octet_length(file_data) = file_size')
      .execute();
    if (!result.affected) {
      const current = await this.documentsRepository.findOne({
        where: { id: documentId, companyId },
      });
      if (current?.status === DocumentStatus.APPROVED) return current;
      throw new BadRequestException(
        'Pending upload content was not found or has invalid size',
      );
    }
    const approvedDocument = await this.documentsRepository.findOneOrFail({
      where: { id: documentId, companyId },
    });
    this.logger.log(
      `document_upload_approved documentId=${documentId} companyId=${companyId}`,
    );
    return approvedDocument;
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    actor: DocumentActor,
  ): Promise<Document[]> {
    const companyId = this.requireCompanyId(actor);
    await this.assertEntityAccessible(entityType, entityId, actor);
    const normalizedEntityType = this.normalizeEntityType(entityType);
    return this.documentsRepository.find({
      where: {
        entityType: normalizedEntityType,
        entityId,
        companyId,
        status: DocumentStatus.APPROVED,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async remove(documentId: string, actor: DocumentActor): Promise<void> {
    const companyId = this.requireCompanyId(actor);
    const document = await this.documentsRepository.findOne({
      where: { id: documentId, companyId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }
    await this.assertEntityAccessible(
      document.entityType,
      document.entityId,
      actor,
    );

    // Soft delete from DB
    await this.documentsRepository.softDelete({ id: documentId, companyId });
  }

  private normalizeEntityType(entityType: string): string {
    const normalized = entityType.trim().toLowerCase();
    return CANONICAL_ENTITY_TYPES[normalized] ?? normalized;
  }

  private requireCompanyId(actor: DocumentActor): string {
    if (!actor.companyId) {
      throw new NotFoundException('Document parent entity not found');
    }
    return actor.companyId;
  }

  private async assertEntityAccessible(
    entityType: string,
    entityId: string,
    actor: DocumentActor,
  ): Promise<void> {
    const companyId = this.requireCompanyId(actor);
    const normalized = this.normalizeEntityType(entityType);
    const table = UPLOAD_ENTITY_TABLES[normalized];
    if (!table) {
      throw new BadRequestException('Unsupported document entity type');
    }

    const roles = isAdminOrStaff(actor)
      ? [UserRole.ADMIN]
      : getUserRoles(actor);
    for (const role of roles) {
      const query = this.buildEntityAccessQuery(normalized, table, role);
      const parameters =
        role === UserRole.ADMIN || role === UserRole.STAFF
          ? [entityId, companyId]
          : [entityId, companyId, actor.id];
      const rows = query ? await this.dataSource.query(query, parameters) : [];
      if (Array.isArray(rows) && rows.length === 1) {
        return;
      }
    }
    throw new NotFoundException('Document parent entity not found');
  }

  private buildEntityAccessQuery(
    entityType: string,
    table: string,
    role: UserRole,
  ): string | null {
    if (role === UserRole.ADMIN || role === UserRole.STAFF) {
      return `SELECT id FROM ${table} WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL LIMIT 1`;
    }

    const queries: Partial<Record<UserRole, Record<string, string>>> = {
      [UserRole.OWNER]: {
        owner:
          'SELECT o.id FROM owners o WHERE o.id = $1 AND o.company_id = $2 AND o.user_id = $3 AND o.deleted_at IS NULL LIMIT 1',
        property:
          'SELECT p.id FROM properties p JOIN owners o ON o.id = p.owner_id AND o.deleted_at IS NULL WHERE p.id = $1 AND p.company_id = $2 AND o.user_id = $3 AND p.deleted_at IS NULL LIMIT 1',
        unit: 'SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id AND p.deleted_at IS NULL JOIN owners o ON o.id = p.owner_id AND o.deleted_at IS NULL WHERE u.id = $1 AND u.company_id = $2 AND o.user_id = $3 AND u.deleted_at IS NULL LIMIT 1',
        lease:
          'SELECT l.id FROM leases l JOIN owners o ON o.id = l.owner_id AND o.deleted_at IS NULL WHERE l.id = $1 AND l.company_id = $2 AND o.user_id = $3 AND l.deleted_at IS NULL LIMIT 1',
        tenant:
          'SELECT t.id FROM tenants t JOIN leases l ON l.tenant_id = t.id AND l.deleted_at IS NULL JOIN owners o ON o.id = l.owner_id AND o.deleted_at IS NULL WHERE t.id = $1 AND t.company_id = $2 AND o.user_id = $3 AND t.deleted_at IS NULL LIMIT 1',
        maintenance_ticket:
          'SELECT mt.id FROM maintenance_tickets mt JOIN properties p ON p.id = mt.property_id AND p.deleted_at IS NULL JOIN owners o ON o.id = p.owner_id AND o.deleted_at IS NULL WHERE mt.id = $1 AND mt.company_id = $2 AND o.user_id = $3 AND mt.deleted_at IS NULL LIMIT 1',
      },
      [UserRole.TENANT]: {
        tenant:
          'SELECT t.id FROM tenants t WHERE t.id = $1 AND t.company_id = $2 AND t.user_id = $3 AND t.deleted_at IS NULL LIMIT 1',
        lease:
          'SELECT l.id FROM leases l JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL WHERE l.id = $1 AND l.company_id = $2 AND t.user_id = $3 AND l.deleted_at IS NULL LIMIT 1',
        property:
          "SELECT p.id FROM properties p JOIN leases l ON l.property_id = p.id AND l.contract_type = 'rental' AND l.status = 'active' AND l.deleted_at IS NULL JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL WHERE p.id = $1 AND p.company_id = $2 AND t.user_id = $3 AND p.deleted_at IS NULL LIMIT 1",
        unit: "SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id AND p.deleted_at IS NULL JOIN leases l ON l.property_id = p.id AND l.contract_type = 'rental' AND l.status = 'active' AND l.deleted_at IS NULL JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL WHERE u.id = $1 AND u.company_id = $2 AND t.user_id = $3 AND u.deleted_at IS NULL LIMIT 1",
        maintenance_ticket:
          "SELECT mt.id FROM maintenance_tickets mt JOIN properties p ON p.id = mt.property_id AND p.deleted_at IS NULL JOIN leases l ON l.property_id = p.id AND l.contract_type = 'rental' AND l.status = 'active' AND l.deleted_at IS NULL JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL WHERE mt.id = $1 AND mt.company_id = $2 AND t.user_id = $3 AND mt.deleted_at IS NULL LIMIT 1",
      },
      [UserRole.BUYER]: {
        lease:
          'SELECT l.id FROM leases l JOIN buyers b ON b.id = l.buyer_id AND b.deleted_at IS NULL WHERE l.id = $1 AND l.company_id = $2 AND b.user_id = $3 AND l.deleted_at IS NULL LIMIT 1',
        property:
          "SELECT p.id FROM properties p JOIN leases l ON l.property_id = p.id AND l.contract_type = 'sale' AND l.deleted_at IS NULL JOIN buyers b ON b.id = l.buyer_id AND b.deleted_at IS NULL WHERE p.id = $1 AND p.company_id = $2 AND b.user_id = $3 AND p.deleted_at IS NULL LIMIT 1",
        unit: "SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id AND p.deleted_at IS NULL JOIN leases l ON l.property_id = p.id AND l.contract_type = 'sale' AND l.deleted_at IS NULL JOIN buyers b ON b.id = l.buyer_id AND b.deleted_at IS NULL WHERE u.id = $1 AND u.company_id = $2 AND b.user_id = $3 AND u.deleted_at IS NULL LIMIT 1",
      },
    };

    return queries[role]?.[entityType] ?? null;
  }

  /** Internal download; callers authorize access to the owning business entity. */
  async downloadByFileUrl(
    fileUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!fileUrl.startsWith('db://document/')) {
      throw new NotFoundException(
        'Document content is not stored in the database',
      );
    }
    const documentId = fileUrl.slice('db://document/'.length).trim();
    const document = await this.documentsRepository.findOne({
      where: { id: documentId },
      select: ['id', 'fileData', 'fileMimeType'],
    });
    if (!document?.fileData)
      throw new NotFoundException(
        `File not found in DB document: ${documentId}`,
      );
    return {
      buffer: Buffer.from(document.fileData),
      contentType: document.fileMimeType || 'application/pdf',
    };
  }
}
