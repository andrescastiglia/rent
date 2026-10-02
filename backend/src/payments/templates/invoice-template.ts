import { formatInvoiceDate } from '../invoice-date';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Invoice } from '../entities/invoice.entity';
import { I18nService } from 'nestjs-i18n';

/**
 * Generate invoice PDF with multilingual support.
 * @param invoice Invoice entity
 * @param i18n I18nService instance
 * @param lang Language code (e.g. 'es', 'en', 'pt')
 */
export function generateInvoicePdf(
  invoice: Invoice,
  i18n: I18nService,
  lang: string = 'es',
  paymentUrl?: string | null,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 80, left: 50, right: 50 },
    });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', reject);

    const buildPdf = async () => {
      // Header (multilingual)
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(i18n.t('invoice.title', { lang }), { align: 'center' })
        .moveDown();

      doc
        .fontSize(12)
        .font('Helvetica')
        .text(
          `${i18n.t('invoice.invoiceNumber', { lang })} ${invoice.invoiceNumber}`,
          { align: 'right' },
        )
        .moveDown(0.5);

      doc
        .fontSize(10)
        .text(
          `${i18n.t('invoice.issueDate', { lang })}: ${invoice.issuedAt ? formatInvoiceDate(invoice.issuedAt, lang) : i18n.t('invoice.draft', { lang })}`,
          { align: 'right' },
        )
        .moveDown(2);

      // Owner (multilingual)
      const owner = invoice.owner;
      const ownerUser = owner?.user;
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(i18n.t('invoice.issuer', { lang }))
        .moveDown(0.5);

      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${i18n.t('invoice.name', { lang })}: ${ownerUser?.firstName || ''} ${ownerUser?.lastName || ''}`,
        )
        .text(`${i18n.t('invoice.email', { lang })}: ${ownerUser?.email || ''}`)
        .moveDown(1.5);

      // Tenant (multilingual)
      const tenant = invoice.lease?.tenant;
      const tenantUser = tenant?.user;
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(i18n.t('invoice.client', { lang }))
        .moveDown(0.5);

      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${i18n.t('invoice.name', { lang })}: ${tenantUser?.firstName || ''} ${tenantUser?.lastName || ''}`,
        )
        .text(
          `${i18n.t('invoice.email', { lang })}: ${tenantUser?.email || ''}`,
        )
        .moveDown(1.5);

      // Propiedad
      const property = invoice.lease?.property;
      if (property) {
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(i18n.t('invoice.property', { lang }))
          .moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .text(
            `${i18n.t('invoice.address', { lang })}: ${property.addressStreet || ''} ${property.addressNumber || ''}, ${property.addressCity || ''}`,
          )
          .moveDown(1.5);
      }

      // Período
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(i18n.t('invoice.period', { lang }))
        .moveDown(0.5);

      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${i18n.t('invoice.fromDate', { lang })}: ${formatInvoiceDate(invoice.periodStart, 'es-AR')}`,
        )
        .text(
          `${i18n.t('invoice.toDate', { lang })}: ${formatInvoiceDate(invoice.periodEnd, 'es-AR')}`,
        )
        .moveDown(1.5);

      // Detalle
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(i18n.t('invoice.detail', { lang }))
        .moveDown(0.5);

      const currencySymbol = getCurrencySymbol(invoice.currencyCode);

      // Tabla de detalle
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 400;

      doc.fontSize(10).font('Helvetica');

      doc.text(i18n.t('invoice.concept', { lang }), col1, tableTop);
      doc.text(i18n.t('invoice.amount', { lang }), col2, tableTop, {
        width: 100,
        align: 'right',
      });

      doc
        .moveTo(col1, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      let y = tableTop + 25;

      // Alquiler
      doc.text(i18n.t('invoice.rent', { lang }), col1, y);
      doc.text(
        `${currencySymbol} ${Number(invoice.subtotal).toLocaleString('es-AR', {
          minimumFractionDigits: 2,
        })}`,
        col2,
        y,
        { width: 100, align: 'right' },
      );
      y += 20;

      // Mora
      if (Number(invoice.lateFee) > 0) {
        doc.text(i18n.t('invoice.lateFee', { lang }), col1, y);
        doc.text(
          `${currencySymbol} ${Number(invoice.lateFee).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
          })}`,
          col2,
          y,
          { width: 100, align: 'right' },
        );
        y += 20;
      }

      // Ajustes
      if (Number(invoice.adjustments) !== 0) {
        doc.text(i18n.t('invoice.adjustments', { lang }), col1, y);
        doc.text(
          `${currencySymbol} ${Number(invoice.adjustments).toLocaleString(
            'es-AR',
            {
              minimumFractionDigits: 2,
            },
          )}`,
          col2,
          y,
          { width: 100, align: 'right' },
        );
        y += 20;
      }

      // Línea total
      doc.moveTo(col1, y).lineTo(550, y).stroke();
      y += 10;

      // Total
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(i18n.t('invoice.total', { lang }), col1, y)
        .text(
          `${currencySymbol} ${Number(invoice.total).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
          })}`,
          col2,
          y,
          { width: 100, align: 'right' },
        );

      y += 30;

      // Vencimiento
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${i18n.t('invoice.dueDate', { lang })}: ${formatInvoiceDate(invoice.dueDate, 'es-AR')}`,
          col1,
          y,
        );

      // Estado
      y += 20;
      const translatedStatus = i18n.t('invoice.' + invoice.status, { lang });
      doc.text(
        `${i18n.t('invoice.status', { lang })}: ${translatedStatus}`,
        col1,
        y,
      );

      if (paymentUrl) {
        if (y > doc.page.height - 190) {
          doc.addPage();
          y = doc.y - 35;
        }
        const qrBuffer = await QRCode.toBuffer(paymentUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 180,
        });
        y += 35;
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text(i18n.t('invoice.pay', { lang }), col1, y);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#0369a1')
          .text(paymentUrl, col1, y + 20, {
            width: 330,
            link: paymentUrl,
            underline: true,
          });
        doc.image(qrBuffer, 445, y - 15, { width: 90 });
        doc.fillColor('#000000');
      }

      // Footer
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Factura ID: ${invoice.id}`, 50, doc.page.height - 50, {
          align: 'center',
        });

      doc.end();
    };

    void buildPdf().catch(reject);
  });
}

function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    ARS: '$',
    USD: 'US$',
    BRL: 'R$',
  };
  return symbols[code] || code;
}
