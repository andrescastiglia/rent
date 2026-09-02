import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from './entities/document.entity';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';
import { UserRole } from '../users/entities/user.entity';

export type DocumentActor = {
  id: string;
  companyId?: string;
  role: UserRole;
};

const UPLOAD_ENTITY_TABLES: Record<string, string> = {
  property: 'properties',
  properties: 'properties',
  unit: 'units',
  units: 'units',
  lease: 'leases',
  leases: 'leases',
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
  tenants: 'tenant',
  owners: 'owner',
  maintenance: 'maintenance_ticket',
};

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private s3Client!: S3Client;
  private bucketName!: string;

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    this.s3Client = getS3Config(this.configService);
    this.bucketName = S3_BUCKET_NAME;
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
    } catch {
      // Bucket doesn't exist, create it
      try {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucketName }),
        );
      } catch (createError) {
        console.error('Failed to create S3 bucket:', createError);
      }
    }
  }

  async generateUploadUrl(
    dto: GenerateUploadUrlDto,
    actor: DocumentActor,
  ): Promise<{ uploadUrl: string; documentId: string }> {
    const companyId = this.requireCompanyId(actor);
    await this.assertEntityAccessible(dto.entityType, dto.entityId, actor);
    // Validate file size based on type
    const maxSize =
      dto.documentType === DocumentType.PHOTO ? 5242880 : 10485760; // 5MB for photos, 10MB for docs
    if (dto.fileSize > maxSize) {
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
    const fileUrl = `quarantine/${companyId}/${randomBytes(24).toString('hex')}`;

    // Create document record
    const document = this.documentsRepository.create({
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

    // Generate pre-signed URL for upload
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileUrl,
      ContentType: dto.mimeType,
      ContentLength: dto.fileSize,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 300,
    });

    return {
      uploadUrl,
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

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: document.fileUrl,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    });

    const downloadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 300,
    });

    return { downloadUrl };
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
    if (
      document.status !== DocumentStatus.PENDING ||
      !document.fileUrl.startsWith(`quarantine/${companyId}/`)
    ) {
      throw new BadRequestException('Document is not pending quarantine');
    }

    let uploaded: { ContentLength?: number; ContentType?: string };
    try {
      uploaded = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: document.fileUrl,
        }),
      );
    } catch {
      throw new BadRequestException('Quarantined upload was not found');
    }
    if (
      uploaded.ContentLength !== document.fileSize ||
      uploaded.ContentType !== document.fileMimeType
    ) {
      throw new BadRequestException(
        'Uploaded object does not match declared size and MIME type',
      );
    }

    const quarantineKey = document.fileUrl;
    const opaqueObjectId = createHash('sha256')
      .update(quarantineKey)
      .digest('hex');
    const approvedKey = `documents/${companyId}/${opaqueObjectId}`;
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${quarantineKey}`,
        Key: approvedKey,
        ContentType: document.fileMimeType,
        MetadataDirective: 'REPLACE',
      }),
    );
    document.fileUrl = approvedKey;
    document.status = DocumentStatus.APPROVED;
    document.verifiedBy = actor.id;
    document.verifiedAt = new Date();

    const approvedDocument = await this.documentsRepository.save(document);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: quarantineKey,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `document_quarantine_cleanup_failed documentId=${documentId} companyId=${companyId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
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

    // Delete from S3
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: document.fileUrl,
        }),
      );
    } catch (error) {
      console.error('Failed to delete from S3:', error);
    }

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

    const query = this.buildEntityAccessQuery(normalized, table, actor.role);
    const rows = query
      ? await this.dataSource.query(query, [entityId, companyId, actor.id])
      : [];
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new NotFoundException('Document parent entity not found');
    }
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

  /**
   * Downloads a file directly from S3 by its key.
   * @param s3Key The S3 key of the file
   * @returns Buffer and content type of the file
   */
  async downloadByS3Key(
    s3Key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (s3Key.startsWith('db://document/')) {
      const documentId = s3Key.replace('db://document/', '').trim();
      const document = await this.documentsRepository.findOne({
        where: { id: documentId },
      });

      if (!document?.fileData) {
        throw new NotFoundException(
          `File not found in DB document: ${documentId}`,
        );
      }

      return {
        buffer: Buffer.from(document.fileData),
        contentType: document.fileMimeType || 'application/pdf',
      };
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);
      const contentType = response.ContentType || 'application/octet-stream';
      const buffer = await this.streamToBuffer(response.Body as any);

      return { buffer, contentType };
    } catch {
      throw new NotFoundException(`File not found in S3: ${s3Key}`);
    }
  }

  /**
   * Converts a stream to a buffer.
   * @param stream The readable stream
   * @returns Buffer
   */
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
