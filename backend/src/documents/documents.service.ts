import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
import { Document, DocumentStatus } from './entities/document.entity';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';

@Injectable()
export class DocumentsService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    @InjectRepository(Document)
    private documentsRepository: Repository<Document>,
    private configService: ConfigService,
  ) {
    this.s3Client = getS3Config(configService);
    this.bucketName = S3_BUCKET_NAME;
    this.ensureBucketExists();
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
    userId: string,
  ): Promise<{ uploadUrl: string; documentId: string }> {
    // Validate file size based on type
    const maxSize = dto.docType === 'image' ? 5242880 : 10485760; // 5MB for images, 10MB for docs
    if (dto.fileSize > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${maxSize / 1048576}MB)`,
      );
    }

    // Validate mime type
    const allowedMimeTypes = {
      image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      contract: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      invoice: ['application/pdf'],
      receipt: ['application/pdf', 'image/jpeg', 'image/png'],
      other: ['application/pdf'],
    };

    if (!allowedMimeTypes[dto.docType]?.includes(dto.mimeType)) {
      throw new BadRequestException(
        `Invalid mime type for document type ${dto.docType}`,
      );
    }

    // Generate unique S3 key
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const s3Key = `${dto.entityType}/${dto.entityId}/${timestamp}-${randomString}-${dto.fileName}`;

    // Create document record
    const document = this.documentsRepository.create({
      entityType: dto.entityType,
      entityId: dto.entityId,
      docType: dto.docType,
      s3Key,
      originalFilename: dto.fileName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      status: DocumentStatus.PENDING,
      uploadedBy: userId,
    });

    await this.documentsRepository.save(document);

    // Generate pre-signed URL for upload
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
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
      Key: document.s3Key,
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

    document.status = DocumentStatus.UPLOADED;
    document.uploadedAt = new Date();

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
          Key: document.s3Key,
        }),
      );
    } catch (error) {
      console.error('Failed to delete from S3:', error);
    }

    // Soft delete from DB
    await this.documentsRepository.softDelete(documentId);
  }
}
