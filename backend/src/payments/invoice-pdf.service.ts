import { formatInvoiceDate } from './invoice-date';
import { financialDocumentMetadata } from '../documents/document-integrity';
import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
import { ConfigService } from '@nestjs/config';
import { buildInvoicePaymentUrl } from './invoice-payment-link';

export type InvoicePdfSnapshot = {
  version: 1;
  invoice: Invoice;
  locale: string;
  templateBody: string | null;
  paymentUrl: string | null;
};

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
    private readonly configService: ConfigService,
  ) {}

  /**
   * Genera el PDF de una factura y lo guarda en la base de datos.
   * @param invoice Factura
   * @returns URL del PDF almacenado en DB (db://document/{id})
   */
  async captureSnapshot(
    invoice: Invoice,
    manager?: EntityManager,
  ): Promise<InvoicePdfSnapshot> {
    const lang = invoice.lease?.tenant?.user?.language || 'es';
    const paymentUrl = buildInvoicePaymentUrl(
      this.configService.get<string>('FRONTEND_URL'),
      invoice.id,
      lang,
    );
    const activeTemplate = await this.templatesService.findActiveTemplate(
      invoice.companyId,
      PaymentDocumentTemplateType.INVOICE,
      manager,
    );
    const person = (user?: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
    }) => ({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
    });
    const property = invoice.lease?.property;
    // Whitelist rendering fields: never copy users' credentials or unrelated account data.
    const source = {
      id: invoice.id,
      companyId: invoice.companyId,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      status: invoice.status,
      subtotal: invoice.subtotal,
      lateFee: invoice.lateFee,
      adjustments: invoice.adjustments,
      total: invoice.total,
      currencyCode: invoice.currencyCode,
      notes: invoice.notes,
      owner: { user: person(invoice.owner?.user) },
      lease: {
        tenant: { user: person(invoice.lease?.tenant?.user) },
        property: property
          ? {
              name: property.name,
              addressStreet: property.addressStreet,
              addressNumber: property.addressNumber,
              addressCity: property.addressCity,
              addressState: property.addressState,
            }
          : undefined,
      },
    } as Invoice;
    return {
      version: 1,
      invoice: source,
      locale: lang,
      templateBody: activeTemplate?.templateBody ?? null,
      paymentUrl,
    };
  }

  async generate(invoice: Invoice): Promise<string> {
    return this.generateSnapshot(await this.captureSnapshot(invoice));
  }

  async generateSnapshot(
    snapshot: InvoicePdfSnapshot,
    manager?: EntityManager,
  ): Promise<string> {
    const { invoice, locale: lang, templateBody, paymentUrl } = snapshot;
    const pdfBuffer =
      templateBody !== null
        ? await this.generateFromTemplate(
            templateBody,
            invoice,
            lang,
            paymentUrl,
          )
        : await generateInvoicePdf(invoice, this.i18n, lang, paymentUrl);

    const repository =
      manager?.getRepository(Document) ?? this.documentsRepository;
    const document = await repository.save(
      repository.create({
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
        metadata: financialDocumentMetadata(pdfBuffer),
      }),
    );

    document.fileUrl = `db://document/${document.id}`;
    await repository.save(document);
    return document.fileUrl;
  }

  private async generateFromTemplate(
    templateBody: string,
    invoice: Invoice,
    lang: string,
    paymentUrl: string | null,
  ): Promise<Buffer> {
    const title = this.i18n.t('invoice.title', { lang });
    const context = this.buildTemplateContext(invoice);
    const rendered = renderDocumentTemplate(templateBody, context);
    return generateCustomDocumentPdf(
      `${title} ${invoice.invoiceNumber}`,
      rendered,
      `Factura ID: ${invoice.id}`,
      { paymentUrl },
    );
  }

  private buildTemplateContext(invoice: Invoice): Record<string, unknown> {
    const ownerUser = invoice.owner?.user;
    const tenantUser = invoice.lease?.tenant?.user;
    const property = invoice.lease?.property;
    const currencySymbol = getCurrencySymbol(invoice.currencyCode);
    const issueDate = invoice.issuedAt ? new Date(invoice.issuedAt) : null;

    return {
      today: issueDate ? formatInvoiceDate(invoice.issuedAt, 'es-AR') : '',
      invoice: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        issueDate: issueDate
          ? formatInvoiceDate(invoice.issuedAt, 'es-AR')
          : '',
        dueDate: formatInvoiceDate(invoice.dueDate, 'es-AR'),
        periodStart: formatInvoiceDate(invoice.periodStart, 'es-AR'),
        periodEnd: formatInvoiceDate(invoice.periodEnd, 'es-AR'),
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
