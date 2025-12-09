import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Receipt } from './entities/receipt.entity';
import { Payment } from './entities/payment.entity';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { generateReceiptPdf } from './templates/receipt-template';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';

/**
 * Servicio para generar PDFs de recibos.
 */
@Injectable()
export class ReceiptPdfService {
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

  /**
   * Genera el PDF de un recibo y lo sube a S3.
   * @param receipt Recibo
   * @param payment Pago asociado
   * @returns URL del PDF en S3
   */
  async generate(receipt: Receipt, payment: Payment): Promise<string> {
    // Generar PDF buffer
    const pdfBuffer = await generateReceiptPdf(receipt, payment);

    // Generar file URL (S3 key)
    const timestamp = Date.now();
    const fileUrl = `receipts/${receipt.id}/receipt-${timestamp}.pdf`;

    // Subir a S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileUrl,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }),
    );

    // Crear registro de documento - get companyId from lease via tenantAccount
    const companyId = payment.tenantAccount?.lease?.companyId || payment.tenantAccountId;
    const document = this.documentsRepository.create({
      companyId,
      entityType: 'receipt',
      entityId: receipt.id,
      documentType: DocumentType.OTHER,
      name: `recibo-${receipt.receiptNumber}.pdf`,
      fileUrl,
      fileMimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      status: DocumentStatus.APPROVED,
    });

    await this.documentsRepository.save(document);

    return fileUrl;
  }
}
