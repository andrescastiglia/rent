import * as PDFDocument from 'pdfkit';
import { Invoice } from '../entities/invoice.entity';

/**
 * Genera el PDF de una factura.
 * @param invoice Factura
 * @returns Buffer del PDF
 */
export function generateInvoicePdf(invoice: Invoice): Promise<Buffer> {
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
      .text('FACTURA', { align: 'center' })
      .moveDown();

    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Nº ${invoice.invoiceNumber}`, { align: 'right' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        `Fecha de emisión: ${invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString('es-AR') : 'Borrador'}`,
        { align: 'right' },
      )
      .moveDown(2);

    // Emisor (Propietario)
    const owner = invoice.owner;
    const ownerUser = owner?.user;
    doc.fontSize(14).font('Helvetica-Bold').text('EMISOR').moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Nombre: ${ownerUser?.firstName || ''} ${ownerUser?.lastName || ''}`)
      .text(`Email: ${ownerUser?.email || ''}`)
      .moveDown(1.5);

    // Cliente (Inquilino)
    const tenant = invoice.lease?.tenant;
    const tenantUser = tenant?.user;
    doc.fontSize(14).font('Helvetica-Bold').text('CLIENTE').moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Nombre: ${tenantUser?.firstName || ''} ${tenantUser?.lastName || ''}`)
      .text(`Email: ${tenantUser?.email || ''}`)
      .moveDown(1.5);

    // Propiedad
    const property = invoice.lease?.unit?.property;
    const unit = invoice.lease?.unit;
    if (property) {
      doc.fontSize(14).font('Helvetica-Bold').text('INMUEBLE').moveDown(0.5);

      doc
        .fontSize(11)
        .font('Helvetica')
        .text(`Dirección: ${property.addressStreet || ''} ${property.addressNumber || ''}, ${property.addressCity || ''}`)
        .text(`Unidad: ${unit?.unitNumber || ''}`)
        .moveDown(1.5);
    }

    // Período
    doc.fontSize(14).font('Helvetica-Bold').text('PERÍODO').moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        `Desde: ${new Date(invoice.periodStart).toLocaleDateString('es-AR')}`,
      )
      .text(`Hasta: ${new Date(invoice.periodEnd).toLocaleDateString('es-AR')}`)
      .moveDown(1.5);

    // Detalle
    doc.fontSize(14).font('Helvetica-Bold').text('DETALLE').moveDown(0.5);

    const currencySymbol = getCurrencySymbol(invoice.currencyCode);

    // Tabla de detalle
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 400;

    doc.fontSize(10).font('Helvetica');

    doc.text('Concepto', col1, tableTop);
    doc.text('Monto', col2, tableTop, { width: 100, align: 'right' });

    doc
      .moveTo(col1, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    let y = tableTop + 25;

    // Alquiler
    doc.text('Alquiler', col1, y);
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
      doc.text('Mora', col1, y);
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
      doc.text('Ajustes', col1, y);
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
      .text('TOTAL', col1, y)
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
        `Fecha de vencimiento: ${new Date(invoice.dueDate).toLocaleDateString('es-AR')}`,
        col1,
        y,
      );

    // Estado
    y += 20;
    doc.text(`Estado: ${formatInvoiceStatus(invoice.status)}`, col1, y);

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Factura ID: ${invoice.id}`, 50, doc.page.height - 50, {
        align: 'center',
      });

    doc.end();
  });
}

/**
 * Formatea el estado de la factura.
 */
function formatInvoiceStatus(status: string): string {
  const statuses: Record<string, string> = {
    draft: 'Borrador',
    issued: 'Emitida',
    paid: 'Pagada',
    partially_paid: 'Pago parcial',
    cancelled: 'Anulada',
    overdue: 'Vencida',
  };
  return statuses[status] || status;
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
