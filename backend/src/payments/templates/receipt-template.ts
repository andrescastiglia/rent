import * as PDFDocument from 'pdfkit';
import { Receipt } from '../entities/receipt.entity';
import { Payment } from '../entities/payment.entity';
import { I18nService } from 'nestjs-i18n';

/**
 * Generate payment receipt PDF with multilingual support.
 * @param receipt Receipt entity
 * @param payment Payment entity
 * @param i18n I18nService instance
 * @param lang Language code (e.g. 'es', 'en', 'pt')
 */
export function generateReceiptPdf(
  receipt: Receipt,
  payment: Payment,
  i18n: I18nService,
  lang: string = 'es',
): Promise<Buffer> {
  return new Promise<Buffer>(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', reject);

    // Header (multilingual)
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(await i18n.t('payment.title', { lang }), { align: 'center' })
      .moveDown();

    doc
      .fontSize(12)
      .font('Helvetica')
      .text(
        `${await i18n.t('payment.receiptNumber', { lang })} ${receipt.receiptNumber}`,
        { align: 'right' },
      )
      .moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        `${await i18n.t('payment.issueDate', { lang })}: ${new Date(receipt.issuedAt).toLocaleDateString(lang)}`,
        { align: 'right' },
      )
      .moveDown(2);

    // Tenant data (multilingual)
    const tenant = payment.tenantAccount?.lease?.tenant;
    const tenantUser = tenant?.user;
    if (tenantUser) {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(await i18n.t('payment.receivedFrom', { lang }))
        .moveDown(0.5);

      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `${await i18n.t('payment.name', { lang })}: ${tenantUser.firstName || ''} ${tenantUser.lastName || ''}`,
        )
        .text(
          `${await i18n.t('payment.email', { lang })}: ${tenantUser.email || ''}`,
        )
        .moveDown(1.5);
    }

    // Datos del pago
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DETALLE DEL PAGO')
      .moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        `Fecha de pago: ${new Date(payment.paymentDate).toLocaleDateString('es-AR')}`,
      )
      .text(`Método: ${formatPaymentMethod(payment.method)}`)
      .text(`Referencia: ${payment.reference || 'N/A'}`)
      .moveDown(1);

    // Items variables
    if (payment.items && payment.items.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').text('ITEMS').moveDown(0.3);

      payment.items.forEach((item) => {
        const sign = item.type === 'discount' ? '-' : '';
        const total = Number(item.amount) * Number(item.quantity || 1);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            `${item.description} x${item.quantity || 1} - ${sign}${getCurrencySymbol(
              receipt.currencyCode,
            )} ${total.toLocaleString('es-AR', {
              minimumFractionDigits: 2,
            })}`,
          );
      });

      doc.moveDown(1);
    }

    // Monto
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('MONTO RECIBIDO')
      .moveDown(0.5);

    const currencySymbol = getCurrencySymbol(receipt.currencyCode);
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(
        `${currencySymbol} ${Number(receipt.amount).toLocaleString('es-AR', {
          minimumFractionDigits: 2,
        })}`,
        { align: 'center' },
      )
      .moveDown(2);

    // Notas
    if (payment.notes) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('OBSERVACIONES')
        .moveDown(0.5);

      doc.fontSize(10).font('Helvetica').text(payment.notes).moveDown(1.5);
    }

    // Línea y firma
    doc.moveDown(3);
    doc
      .fontSize(10)
      .text('_________________________', { align: 'center' })
      .text('Firma y aclaración', { align: 'center' });

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Recibo ID: ${receipt.id}`, 50, doc.page.height - 50, {
        align: 'center',
      });

    doc.end();
  });
}

/**
 * Formatea el método de pago para mostrar.
 */
function formatPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    cash: 'Efectivo',
    bank_transfer: 'Transferencia bancaria',
    check: 'Cheque',
    debit_card: 'Tarjeta de débito',
    credit_card: 'Tarjeta de crédito',
    digital_wallet: 'Billetera digital',
    crypto: 'Cripto',
    other: 'Otro',
  };
  return methods[method] || method;
}

/**
 * Obtiene el símbolo de la moneda.
 */
function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    ARS: '$',
    USD: 'US$',
    BRL: 'R$',
  };
  return symbols[code] || code;
}
