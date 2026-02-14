import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { generateSaleReceiptPdf } from './templates/sale-receipt-template';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';

@Injectable()
export class SaleReceiptPdfService {
  private s3Client: S3Client; // NOSONAR
  private bucketName: string; // NOSONAR

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly configService: ConfigService,
  ) {
    this.s3Client = getS3Config(configService);
    this.bucketName = S3_BUCKET_NAME;
  }

  async generate(
    receipt: SaleReceipt,
    agreement: SaleAgreement,
  ): Promise<string> {
    const pdfBuffer = await generateSaleReceiptPdf(receipt, agreement);

    const timestamp = Date.now();
    const fileUrl = `sale-receipts/${receipt.id}/sale-receipt-${timestamp}.pdf`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileUrl,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }),
    );

    const document = this.documentsRepository.create({
      companyId: agreement.companyId,
      entityType: 'sale_receipt',
      entityId: receipt.id,
      documentType: DocumentType.OTHER,
      name: `recibo-venta-${receipt.receiptNumber}.pdf`,
      fileUrl,
      fileMimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      status: DocumentStatus.APPROVED,
    });

    await this.documentsRepository.save(document);

    return fileUrl;
  }
}
