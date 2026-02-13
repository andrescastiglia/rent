import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { generateInvoicePdf } from './templates/invoice-template';
import { renderDocumentTemplate } from './templates/document-template-renderer';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';

/**
 * Servicio para generar PDFs de facturas.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
    private readonly templatesService: PaymentDocumentTemplatesService,
  ) {}

  /**
   * Genera el PDF de una factura y lo guarda en la base de datos.
   * @param invoice Factura
   * @returns URL del PDF almacenado en DB (db://document/{id})
   */
  async generate(invoice: Invoice): Promise<string> {
    // Obtener idioma preferido del usuario o default
    const lang = invoice.lease?.tenant?.user?.language || 'es';
    const activeTemplate = await this.templatesService.findActiveTemplate(
      invoice.companyId,
      PaymentDocumentTemplateType.INVOICE,
    );
    const pdfBuffer = activeTemplate
      ? await this.generateFromTemplate(
          activeTemplate.templateBody,
          invoice,
          lang,
        )
      : await generateInvoicePdf(invoice, this.i18n, lang);

    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
        companyId: invoice.companyId,
        entityType: 'invoice',
        entityId: invoice.id,
        documentType: DocumentType.OTHER,
        name: `factura-${invoice.invoiceNumber}.pdf`,
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
    invoice: Invoice,
    lang: string,
  ): Promise<Buffer> {
    const title = await this.i18n.t('invoice.title', { lang });
    const context = this.buildTemplateContext(invoice);
    const rendered = renderDocumentTemplate(templateBody, context);
    return generateCustomDocumentPdf(
      `${title} ${invoice.invoiceNumber}`,
      rendered,
      `Factura ID: ${invoice.id}`,
    );
  }

  private buildTemplateContext(invoice: Invoice): Record<string, unknown> {
    const ownerUser = invoice.owner?.user;
    const tenantUser = invoice.lease?.tenant?.user;
    const property = invoice.lease?.property;
    const currencySymbol = getCurrencySymbol(invoice.currencyCode);
    const issueDate = invoice.issuedAt ? new Date(invoice.issuedAt) : null;

    return {
      today: new Date().toLocaleDateString('es-AR'),
      invoice: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        issueDate: issueDate ? issueDate.toLocaleDateString('es-AR') : '',
        dueDate: new Date(invoice.dueDate).toLocaleDateString('es-AR'),
        periodStart: new Date(invoice.periodStart).toLocaleDateString('es-AR'),
        periodEnd: new Date(invoice.periodEnd).toLocaleDateString('es-AR'),
        status: invoice.status,
        subtotal: Number(invoice.subtotal).toFixed(2),
        lateFee: Number(invoice.lateFee || 0).toFixed(2),
        adjustments: Number(invoice.adjustments || 0).toFixed(2),
        total: Number(invoice.total).toFixed(2),
        currency: invoice.currencyCode,
        currencySymbol,
        notes: invoice.notes || '',
      },
      owner: {
        firstName: ownerUser?.firstName || '',
        lastName: ownerUser?.lastName || '',
        fullName:
          `${ownerUser?.firstName || ''} ${ownerUser?.lastName || ''}`.trim(),
        email: ownerUser?.email || '',
      },
      tenant: {
        firstName: tenantUser?.firstName || '',
        lastName: tenantUser?.lastName || '',
        fullName:
          `${tenantUser?.firstName || ''} ${tenantUser?.lastName || ''}`.trim(),
        email: tenantUser?.email || '',
      },
      property: {
        name: property?.name || '',
        addressStreet: property?.addressStreet || '',
        addressNumber: property?.addressNumber || '',
        addressCity: property?.addressCity || '',
        addressState: property?.addressState || '',
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
