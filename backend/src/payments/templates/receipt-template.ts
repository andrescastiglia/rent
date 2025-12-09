import * as PDFDocument from 'pdfkit';
import { Receipt } from '../entities/receipt.entity';
import { Payment } from '../entities/payment.entity';

/**
 * Genera el PDF de un recibo de pago.
 * @param receipt Recibo
 * @param payment Pago asociado
 * @returns Buffer del PDF
 */
export function generateReceiptPdf(
  receipt: Receipt,
  payment: Payment,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', reject);

    // Header
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('RECIBO DE PAGO', { align: 'center' })
      .moveDown();

    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Nº ${receipt.receiptNumber}`, { align: 'right' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        `Fecha de emisión: ${new Date(receipt.issuedAt).toLocaleDateString('es-AR')}`,
        { align: 'right' },
      )
      .moveDown(2);

    // Datos del inquilino
    const tenant = payment.tenantAccount?.lease?.tenant;
    const tenantUser = tenant?.user;
    if (tenantUser) {
      doc.fontSize(14).font('Helvetica-Bold').text('RECIBIDO DE').moveDown(0.5);

      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `Nombre: ${tenantUser.firstName || ''} ${tenantUser.lastName || ''}`,
        )
        .text(`Email: ${tenantUser.email || ''}`)
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
      .moveDown(1.5);

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
    transfer: 'Transferencia bancaria',
    check: 'Cheque',
    debit: 'Débito',
    credit: 'Crédito',
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
