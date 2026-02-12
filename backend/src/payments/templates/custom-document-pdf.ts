import * as PDFDocument from 'pdfkit';

export function generateCustomDocumentPdf(
  title: string,
  bodyText: string,
  footerText: string,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica').text(bodyText, {
      align: 'left',
      lineGap: 4,
    });

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(footerText, 50, doc.page.height - 50, { align: 'center' });

    doc.end();
  });
}
