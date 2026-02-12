import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditNote } from './entities/credit-note.entity';
import { Invoice } from './entities/invoice.entity';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from '../documents/entities/document.entity';
import { generateCreditNotePdf } from './templates/credit-note-template';
import { renderDocumentTemplate } from './templates/document-template-renderer';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';

@Injectable()
export class CreditNotePdfService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
    private readonly templatesService: PaymentDocumentTemplatesService,
  ) {}

  async generate(creditNote: CreditNote, invoice: Invoice): Promise<string> {
    const lang = invoice.lease?.tenant?.user?.language || 'es';
    const activeTemplate = await this.templatesService.findActiveTemplate(
      creditNote.companyId,
      PaymentDocumentTemplateType.CREDIT_NOTE,
    );
    const pdfBuffer = activeTemplate
      ? await this.generateFromTemplate(
          activeTemplate.templateBody,
          creditNote,
          invoice,
          lang,
        )
      : await generateCreditNotePdf(creditNote, invoice, this.i18n, lang);

    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
        companyId: creditNote.companyId,
        entityType: 'credit_note',
        entityId: creditNote.id,
        documentType: DocumentType.OTHER,
        name: `nota-credito-${creditNote.noteNumber}.pdf`,
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
    creditNote: CreditNote,
    invoice: Invoice,
    lang: string,
  ): Promise<Buffer> {
    const title = await this.i18n.t('creditNote.header', { lang });
    const context = this.buildTemplateContext(creditNote, invoice);
    const rendered = renderDocumentTemplate(templateBody, context);
    return generateCustomDocumentPdf(
      `${title} ${creditNote.noteNumber}`,
      rendered,
      `Nota de crédito ID: ${creditNote.id}`,
    );
  }

  private buildTemplateContext(
    creditNote: CreditNote,
    invoice: Invoice,
  ): Record<string, unknown> {
    return {
      today: new Date().toLocaleDateString('es-AR'),
      creditNote: {
        id: creditNote.id,
        number: creditNote.noteNumber,
        issueDate: new Date(creditNote.issuedAt).toLocaleDateString('es-AR'),
        amount: Number(creditNote.amount).toFixed(2),
        currency: creditNote.currencyCode,
        reason: creditNote.reason || '',
      },
      invoice: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        dueDate: new Date(invoice.dueDate).toLocaleDateString('es-AR'),
        total: Number(invoice.total).toFixed(2),
        currency: invoice.currencyCode,
      },
      tenant: {
        firstName: invoice.lease?.tenant?.user?.firstName || '',
        lastName: invoice.lease?.tenant?.user?.lastName || '',
        fullName:
          `${invoice.lease?.tenant?.user?.firstName || ''} ${invoice.lease?.tenant?.user?.lastName || ''}`.trim(),
      },
    };
  }
}
