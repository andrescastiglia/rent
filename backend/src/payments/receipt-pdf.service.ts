import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { Payment } from './entities/payment.entity';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { generateReceiptPdf } from './templates/receipt-template';

/**
 * Servicio para generar PDFs de recibos.
 */
@Injectable()
export class ReceiptPdfService {
  constructor(
    @InjectRepository(Document)
    private documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Genera el PDF de un recibo y lo guarda en la base de datos.
   * @param receipt Recibo
   * @param payment Pago asociado
   * @returns URL del PDF en S3
   */
  async generate(receipt: Receipt, payment: Payment): Promise<string> {
    // Obtener idioma preferido del usuario o default
    const lang = payment.tenantAccount?.lease?.tenant?.user?.language || 'es';
    // Generar PDF buffer
    const pdfBuffer = await generateReceiptPdf(
      receipt,
      payment,
      this.i18n,
      lang,
    );

    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
        companyId: payment.companyId,
        entityType: 'receipt',
        entityId: receipt.id,
        documentType: DocumentType.OTHER,
        name: `recibo-${receipt.receiptNumber}.pdf`,
        fileUrl: 'db://document/pending',
        fileData: pdfBuffer,
        fileMimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        status: DocumentStatus.APPROVED,
      }),
    );

    document.fileUrl = `db://document/${document.id}`;
    await this.documentsRepository.save(document);
    return document.fileUrl;
  }
}
