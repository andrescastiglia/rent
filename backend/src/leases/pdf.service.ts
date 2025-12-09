import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Lease } from './entities/lease.entity';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { generateContractPdf } from './templates/contract-template';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';

@Injectable()
export class PdfService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    @InjectRepository(Document)
    private documentsRepository: Repository<Document>,
    private configService: ConfigService,
  ) {
    this.s3Client = getS3Config(configService);
    this.bucketName = S3_BUCKET_NAME;
  }

  async generateContract(lease: Lease, _userId: string): Promise<Document> {
    // Generate PDF buffer
    const pdfBuffer = await generateContractPdf(lease);

    // Generate S3 key / file URL
    const timestamp = Date.now();
    const fileUrl = `leases/${lease.id}/contract-${timestamp}.pdf`;

    // Upload to S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileUrl,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }),
    );

    // Create document record
    const document = this.documentsRepository.create({
      companyId: lease.companyId,
      entityType: 'lease',
      entityId: lease.id,
      documentType: DocumentType.LEASE_CONTRACT,
      name: `contrato-${lease.id}.pdf`,
      fileUrl,
      fileMimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      status: DocumentStatus.APPROVED,
    });

    return this.documentsRepository.save(document);
  }

  async getContractDocument(leaseId: string): Promise<Document | null> {
    return this.documentsRepository.findOne({
      where: {
        entityType: 'lease',
        entityId: leaseId,
        documentType: DocumentType.LEASE_CONTRACT,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
