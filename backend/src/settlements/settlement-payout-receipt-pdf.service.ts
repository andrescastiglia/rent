import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
export type PayoutReceiptSnapshot = {
  version: 1;
  movementId: string;
  settlementId: string;
  ownerId: string;
  ownerName: string;
  companyName: string;
  period: string;
  kind: 'transfer' | 'reversal';
  amount: string;
  currency: string;
  grossAmount: string;
  commissionAmount: string;
  withholdingsAmount: string;
  transactionId: string;
  providerUpdatedAt: string;
};
@Injectable()
export class SettlementPayoutReceiptPdfService {
  generate(snapshot: PayoutReceiptSnapshot): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      const reversal = snapshot.kind === 'reversal';
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(
          reversal
            ? 'Constancia de devolución de transferencia'
            : 'Comprobante de acreditación de liquidación',
          { align: 'center' },
        );
      doc.moveDown().font('Helvetica').fontSize(11);
      for (const line of [
        `Empresa: ${snapshot.companyName}`,
        `Propietario: ${snapshot.ownerName}`,
        `Período de liquidación: ${snapshot.period}`,
        `Fecha informada por el proveedor (UTC): ${new Date(snapshot.providerUpdatedAt).toISOString()}`,
        `Proveedor: Mercado Pago`,
        `Transacción: ${snapshot.transactionId}`,
      ])
        doc.text(line).moveDown(0.5);
      doc.moveDown();
      if (!reversal) {
        doc.text(`Importe bruto: ${snapshot.currency} ${snapshot.grossAmount}`);
        doc.text(`Comisión: ${snapshot.currency} ${snapshot.commissionAmount}`);
        doc.text(
          `Retenciones: ${snapshot.currency} ${snapshot.withholdingsAmount}`,
        );
      }
      doc
        .font('Helvetica-Bold')
        .text(
          `${reversal ? 'Importe devuelto' : 'Neto acreditado'}: ${snapshot.currency} ${snapshot.amount}`,
        );
      doc
        .moveDown()
        .font('Helvetica')
        .fontSize(10)
        .text(
          reversal
            ? 'Este comprobante registra una devolución completa confirmada por el proveedor. No acredita un nuevo pago al propietario.'
            : 'Este comprobante registra una acreditación confirmada por el proveedor en la fecha indicada. Consulte el historial de la liquidación para conocer devoluciónes posteriores.',
        );
      doc.moveDown(2).fontSize(8);
      doc.text(`Liquidación: ${snapshot.settlementId}`);
      doc.text(`Movimiento: ${snapshot.movementId}`);
      doc.text('Versión del comprobante: 1');
      doc.end();
    });
  }
}
