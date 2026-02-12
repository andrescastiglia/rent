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
import { renderDocumentTemplate } from './templates/document-template-renderer';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';

/**
 * Servicio para generar PDFs de recibos.
 */
@Injectable()
export class ReceiptPdfService {
  constructor(
    @InjectRepository(Document)
    private documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
    private readonly templatesService: PaymentDocumentTemplatesService,
  ) {}

  /**
   * Genera el PDF de un recibo y lo guarda en la base de datos.
   * @param receipt Recibo
   * @param payment Pago asociado
   * @returns URL del PDF almacenado en DB (db://document/{id})
   */
  async generate(receipt: Receipt, payment: Payment): Promise<string> {
    // Obtener idioma preferido del usuario o default
    const lang = payment.tenantAccount?.lease?.tenant?.user?.language || 'es';
    const activeTemplate = await this.templatesService.findActiveTemplate(
      payment.companyId,
      PaymentDocumentTemplateType.RECEIPT,
    );
    const pdfBuffer = activeTemplate
      ? await this.generateFromTemplate(
          activeTemplate.templateBody,
          receipt,
          payment,
          lang,
        )
      : await generateReceiptPdf(receipt, payment, this.i18n, lang);

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

  private async generateFromTemplate(
    templateBody: string,
    receipt: Receipt,
    payment: Payment,
    lang: string,
  ): Promise<Buffer> {
    const title = await this.i18n.t('payment.title', { lang });
    const context = this.buildTemplateContext(receipt, payment);
    const rendered = renderDocumentTemplate(templateBody, context);
    return generateCustomDocumentPdf(
      `${title} ${receipt.receiptNumber}`,
      rendered,
      `Recibo ID: ${receipt.id}`,
    );
  }

  private buildTemplateContext(
    receipt: Receipt,
    payment: Payment,
  ): Record<string, unknown> {
    const tenant = payment.tenantAccount?.lease?.tenant?.user;
    const property = payment.tenantAccount?.lease?.property;
    const issuedAt = new Date(receipt.issuedAt);
    const paymentDate = new Date(payment.paymentDate);
    const currencySymbol = getCurrencySymbol(receipt.currencyCode);
    const itemsSummary = (payment.items ?? [])
      .map((item) => {
        const sign = item.type === 'discount' ? '-' : '';
        const total = Number(item.amount) * Number(item.quantity || 1);
        return `${item.description} x${item.quantity || 1} - ${sign}${currencySymbol} ${total.toFixed(2)}`;
      })
      .join('\n');

    return {
      today: new Date().toLocaleDateString('es-AR'),
      receipt: {
        id: receipt.id,
        number: receipt.receiptNumber,
        issuedAt: issuedAt.toLocaleDateString('es-AR'),
        amount: Number(receipt.amount).toFixed(2),
        currency: receipt.currencyCode,
        currencySymbol,
      },
      payment: {
        id: payment.id,
        amount: Number(payment.amount).toFixed(2),
        date: paymentDate.toLocaleDateString('es-AR'),
        method: payment.method,
        reference: payment.reference || '',
        notes: payment.notes || '',
        itemsSummary,
      },
      tenant: {
        firstName: tenant?.firstName || '',
        lastName: tenant?.lastName || '',
        fullName: `${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim(),
        email: tenant?.email || '',
      },
      property: {
        name: property?.name || '',
        addressStreet: property?.addressStreet || '',
        addressNumber: property?.addressNumber || '',
        addressCity: property?.addressCity || '',
      },
    };
  }
}

function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    ARS: '$',
    USD: 'US$',
    BRL: 'R$',
  };
  return symbols[code] || code;
}
