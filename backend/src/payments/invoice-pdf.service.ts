import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Invoice } from './entities/invoice.entity';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { generateInvoicePdf } from './templates/invoice-template';
import { getS3Config, S3_BUCKET_NAME } from '../config/s3.config';

/**
 * Servicio para generar PDFs de facturas.
 */
@Injectable()
export class InvoicePdfService {
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
   * Genera el PDF de una factura y lo sube a S3.
   * @param invoice Factura
   * @returns URL del PDF en S3
   */
  async generate(invoice: Invoice): Promise<string> {
    // Generar PDF buffer
    const pdfBuffer = await generateInvoicePdf(invoice);

    // Generar file URL (S3 key)
    const timestamp = Date.now();
    const fileUrl = `invoices/${invoice.id}/invoice-${timestamp}.pdf`;

    // Subir a S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileUrl,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }),
    );

    // Crear registro de documento - get companyId from lease
    const companyId = invoice.lease?.companyId || invoice.leaseId; // fallback if not loaded
    const document = this.documentsRepository.create({
      companyId,
      entityType: 'invoice',
      entityId: invoice.id,
      documentType: DocumentType.OTHER,
      name: `factura-${invoice.invoiceNumber}.pdf`,
      fileUrl,
      fileMimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      status: DocumentStatus.APPROVED,
    });

    await this.documentsRepository.save(document);

    return fileUrl;
  }
}
