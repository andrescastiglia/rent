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

    const buildPdf = async () => {
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(await i18n.t('creditNote.header', { lang }), { align: 'center' })
        .moveDown();

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `${await i18n.t('creditNote.number', { lang })}: ${creditNote.noteNumber}`,
        )
        .text(
          `${await i18n.t('creditNote.issueDate', { lang })}: ${new Date(creditNote.issuedAt).toLocaleDateString(lang)}`,
        )
        .moveDown();

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(await i18n.t('creditNote.relatedInvoice', { lang }))
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `${await i18n.t('creditNote.invoiceNumber', { lang })}: ${invoice.invoiceNumber}`,
        )
        .text(
          `${await i18n.t('creditNote.invoiceDueDate', { lang })}: ${new Date(invoice.dueDate).toLocaleDateString(lang)}`,
        )
        .text(
          `${await i18n.t('creditNote.invoiceTotal', { lang })}: ${invoice.currencyCode} ${Number(invoice.total).toLocaleString(lang)}`,
        )
        .moveDown();

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(await i18n.t('creditNote.detail', { lang }))
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `${await i18n.t('creditNote.reason', { lang })}: ${creditNote.reason || (await i18n.t('creditNote.defaultReason', { lang }))}`,
        )
        .text(
          `${await i18n.t('creditNote.amount', { lang })}: ${creditNote.currencyCode} ${Number(creditNote.amount).toLocaleString(lang)}`,
        )
        .moveDown(2);

      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`${await i18n.t('creditNote.id', { lang })}: ${creditNote.id}`, {
          align: 'center',
        });

      doc.end();
    };

    void buildPdf().catch(reject);
  });
}
