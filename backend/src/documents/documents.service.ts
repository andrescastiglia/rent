import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from './entities/document.entity';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';

@Injectable()
export class DocumentsService implements OnModuleInit {
  private s3Client!: S3Client;
  private bucketName!: string;

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.s3Client = getS3Config(this.configService);
    this.bucketName = S3_BUCKET_NAME;
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
    _userId: string,
  ): Promise<{ uploadUrl: string; documentId: string }> {
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

    // Generate unique file URL (S3 key)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileUrl = `${dto.entityType}/${dto.entityId}/${timestamp}-${randomString}-${dto.fileName}`;

    // Create document record
    const document = this.documentsRepository.create({
      companyId: dto.companyId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      documentType: dto.documentType,
      name: dto.fileName,
      fileUrl,
      fileMimeType: dto.mimeType,
      fileSize: dto.fileSize,
      status: DocumentStatus.PENDING,
    });

    await this.documentsRepository.save(document);

    // Generate pre-signed URL for upload
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileUrl,
      ContentType: dto.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600,
    }); // 1 hour

    return {
      uploadUrl,
      documentId: document.id,
    };
  }

  async generateDownloadUrl(
    documentId: string,
  ): Promise<{ downloadUrl: string }> {
    const document = await this.documentsRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: document.fileUrl,
    });

    const downloadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600,
    });

    return { downloadUrl };
  }

  async confirmUpload(documentId: string): Promise<Document> {
    const document = await this.documentsRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    document.status = DocumentStatus.APPROVED;

    return this.documentsRepository.save(document);
  }

  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<Document[]> {
    return this.documentsRepository.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  async remove(documentId: string): Promise<void> {
    const document = await this.documentsRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

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
    await this.documentsRepository.softDelete(documentId);
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
