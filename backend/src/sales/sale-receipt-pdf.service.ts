import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { generateSaleReceiptPdf } from './templates/sale-receipt-template';

@Injectable()
export class SaleReceiptPdfService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
  ) {}

  async generate(
    receipt: SaleReceipt,
    agreement: SaleAgreement,
  ): Promise<string> {
    const pdfBuffer = await generateSaleReceiptPdf(receipt, agreement);

    const id = randomUUID();
    const fileUrl = `db://document/${id}`;

    const document = this.documentsRepository.create({
      id,
      companyId: agreement.companyId,
      entityType: 'sale_receipt',
      entityId: receipt.id,
      documentType: DocumentType.OTHER,
      name: `recibo-venta-${receipt.receiptNumber}.pdf`,
      fileUrl,
      fileData: pdfBuffer,
      fileMimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      status: DocumentStatus.APPROVED,
    });

    await this.documentsRepository.save(document);

    return fileUrl;
  }
}
