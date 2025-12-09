import * as PDFDocument from 'pdfkit';
import { Lease } from '../entities/lease.entity';

export function generateContractPdf(lease: Lease): Promise<Buffer> {
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
      .text('CONTRATO DE ALQUILER', { align: 'center' })
      .moveDown();

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}`, {
        align: 'right',
      })
      .moveDown(2);

    // Partes del contrato
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('PARTES DEL CONTRATO')
      .moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        `Locador (Propietario): ${lease.unit?.property?.owner?.user?.firstName || ''} ${lease.unit?.property?.owner?.user?.lastName || ''}`,
      )
      .text(
        `Locatario (Inquilino): ${lease.tenant?.user?.firstName || ''} ${lease.tenant?.user?.lastName || ''}`,
      )
      .text(`Email: ${lease.tenant?.user?.email || ''}`)
      .moveDown(1.5);

    // Propiedad
    doc.fontSize(14).font('Helvetica-Bold').text('PROPIEDAD').moveDown(0.5);

    const property = lease.unit?.property;
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Dirección: ${property?.addressStreet || ''} ${property?.addressNumber || ''}`)
      .text(
        `Ciudad: ${property?.addressCity || ''}, ${property?.addressState || ''}`,
      )
      .text(`Código Postal: ${property?.addressPostalCode || ''}`)
      .text(`Unidad: ${lease.unit?.unitNumber || ''}`)
      .text(`Área: ${lease.unit?.area || 0} m²`)
      .moveDown(1.5);

    // Términos del contrato
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('TÉRMINOS DEL CONTRATO')
      .moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        `Fecha de inicio: ${new Date(lease.startDate).toLocaleDateString('es-AR')}`,
      )
      .text(
        `Fecha de finalización: ${new Date(lease.endDate).toLocaleDateString('es-AR')}`,
      )
      .text(
        `Renta mensual: ${lease.currency} ${Number(lease.monthlyRent).toLocaleString('es-AR')}`,
      )
      .text(
        `Depósito: ${lease.currency} ${Number(lease.securityDeposit).toLocaleString('es-AR')}`,
      )
      .text(`Frecuencia de pago: ${lease.paymentFrequency}`)
      .moveDown(1.5);

    // Cláusulas
    doc.fontSize(14).font('Helvetica-Bold').text('CLÁUSULAS').moveDown(0.5);

    const clauses = [
      'El locatario se compromete a pagar la renta mensual en la fecha acordada.',
      'El locatario se compromete a mantener la propiedad en buen estado.',
      'El locador se compromete a realizar las reparaciones necesarias.',
      'El depósito será devuelto al finalizar el contrato, sujeto a inspección.',
      'Cualquier modificación al contrato debe ser acordada por escrito.',
    ];

    doc.fontSize(10).font('Helvetica');
    clauses.forEach((clause, index) => {
      doc.text(`${index + 1}. ${clause}`, { indent: 20 }).moveDown(0.3);
    });

    doc.moveDown(1.5);

    // Términos y condiciones
    if (lease.termsAndConditions) {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('TÉRMINOS Y CONDICIONES')
        .moveDown(0.5);

      doc.fontSize(10).font('Helvetica').text(lease.termsAndConditions).moveDown(1.5);
    }

    // Notas adicionales
    if (lease.notes) {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('NOTAS ADICIONALES')
        .moveDown(0.5);

      doc.fontSize(10).font('Helvetica').text(lease.notes).moveDown(1.5);
    }

    // Firmas
    doc.moveDown(3);
    doc
      .fontSize(11)
      .font('Helvetica')
      .text('_________________________', 100, doc.y)
      .text('_________________________', 350, doc.y - 15);

    doc
      .fontSize(10)
      .text('Firma del Locador', 100, doc.y + 5)
      .text('Firma del Locatario', 350, doc.y - 10);

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Contrato ID: ${lease.id}`, 50, doc.page.height - 50, {
        align: 'center',
      });

    doc.end();
  });
}
