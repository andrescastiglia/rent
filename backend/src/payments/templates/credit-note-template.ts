import * as PDFDocument from 'pdfkit';
import { I18nService } from 'nestjs-i18n';
import { CreditNote } from '../entities/credit-note.entity';
import { Invoice } from '../entities/invoice.entity';

export function generateCreditNotePdf(
  creditNote: CreditNote,
  invoice: Invoice,
  i18n: I18nService,
  lang: string = 'es',
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const buildPdf = () => {
      const tHeader = i18n.t('creditNote.header', { lang });
      const tNumber = i18n.t('creditNote.number', { lang });
      const tIssueDate = i18n.t('creditNote.issueDate', { lang });
      const tRelatedInvoice = i18n.t('creditNote.relatedInvoice', {
        lang,
      });
      const tInvoiceNumber = i18n.t('creditNote.invoiceNumber', { lang });
      const tInvoiceDueDate = i18n.t('creditNote.invoiceDueDate', {
        lang,
      });
      const tInvoiceTotal = i18n.t('creditNote.invoiceTotal', { lang });
      const tDetail = i18n.t('creditNote.detail', { lang });
      const tReason = i18n.t('creditNote.reason', { lang });
      const tDefaultReason = creditNote.reason
        ? ''
        : i18n.t('creditNote.defaultReason', { lang });
      const tAmount = i18n.t('creditNote.amount', { lang });
      const tId = i18n.t('creditNote.id', { lang });

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(tHeader, { align: 'center' })
        .moveDown();

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`${tNumber}: ${creditNote.noteNumber}`)
        .text(
          `${tIssueDate}: ${new Date(creditNote.issuedAt).toLocaleDateString(lang)}`,
        )
        .moveDown();

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(tRelatedInvoice)
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`${tInvoiceNumber}: ${invoice.invoiceNumber}`)
        .text(
          `${tInvoiceDueDate}: ${new Date(invoice.dueDate).toLocaleDateString(lang)}`,
        )
        .text(
          `${tInvoiceTotal}: ${invoice.currencyCode} ${Number(invoice.total).toLocaleString(lang)}`,
        )
        .moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text(tDetail).moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`${tReason}: ${creditNote.reason || tDefaultReason}`)
        .text(
          `${tAmount}: ${creditNote.currencyCode} ${Number(creditNote.amount).toLocaleString(lang)}`,
        )
        .moveDown(2);

      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`${tId}: ${creditNote.id}`, { align: 'center' });

      doc.end();
    };

    try {
      buildPdf();
    } catch (error) {
      reject(error);
    }
  });
}
