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

    // Generar S3 key
    const timestamp = Date.now();
    const s3Key = `receipts/${receipt.id}/receipt-${timestamp}.pdf`;

    // Subir a S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }),
    );

    // Crear registro de documento
    const document = this.documentsRepository.create({
      entityType: 'receipt',
      entityId: receipt.id,
      docType: DocumentType.RECEIPT,
      s3Key,
      originalFilename: `recibo-${receipt.receiptNumber}.pdf`,
      mimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      status: DocumentStatus.UPLOADED,
      uploadedAt: new Date(),
    });

    await this.documentsRepository.save(document);

    return s3Key;
  }
}
