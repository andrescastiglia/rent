import PDFDocument from 'pdfkit';
import { SaleReceipt } from '../entities/sale-receipt.entity';
import { SaleAgreement } from '../entities/sale-agreement.entity';

export async function generateSaleReceiptPdf(
  receipt: SaleReceipt,
  agreement: SaleAgreement,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const copies = receipt.copyCount && receipt.copyCount > 0 ? receipt.copyCount : 2;

    for (let i = 0; i < copies; i += 1) {
      const label = i === 0 ? 'ORIGINAL' : 'DUPLICADO';

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(`Recibo de Cuota (${label})`, { align: 'center' })
        .moveDown(1);

      doc.fontSize(12).font('Helvetica');
      doc.text(`Recibo N°: ${receipt.receiptNumber}`);
      doc.text(`Cuota N°: ${receipt.installmentNumber}`);
      doc.text(`Fecha de pago: ${new Date(receipt.paymentDate).toLocaleDateString('es-AR')}`);
      doc.moveDown(0.5);

      doc.text(`Comprador: ${agreement.buyerName}`);
      doc.text(`Teléfono: ${agreement.buyerPhone}`);
      doc.moveDown(0.5);

      doc.text(`Monto cuota: ${agreement.currency} ${Number(receipt.amount).toLocaleString('es-AR')}`);
      doc.text(`Saldo luego del pago: ${agreement.currency} ${Number(receipt.balanceAfter).toLocaleString('es-AR')}`);
      doc.text(`Atraso: ${agreement.currency} ${Number(receipt.overdueAmount).toLocaleString('es-AR')}`);

      doc.moveDown(2);
      doc.text('_________________________', { align: 'center' });
      doc.text('Firma y aclaración', { align: 'center' });

      if (i < copies - 1) {
        doc.addPage();
      }
    }

    doc.end();
  });
}
