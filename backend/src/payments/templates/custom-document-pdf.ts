import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

interface CustomDocumentPdfOptions {
  paymentUrl?: string | null;
}

export function generateCustomDocumentPdf(
  title: string,
  bodyText: string,
  footerText: string,
  options: CustomDocumentPdfOptions = {},
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const render = async () => {
      doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.moveDown(1.5);
      doc.fontSize(10).font('Helvetica').text(bodyText, {
        align: 'left',
        lineGap: 4,
      });

      if (options.paymentUrl) {
        if (doc.y > doc.page.height - 190) {
          doc.addPage();
        }
        const qrBuffer = await QRCode.toBuffer(options.paymentUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 180,
        });
        const sectionY = doc.y + 25;
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text('PAGAR CON MERCADOPAGO', 50, sectionY);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#0369a1')
          .text(options.paymentUrl, 50, sectionY + 20, {
            width: 330,
            link: options.paymentUrl,
            underline: true,
          });
        doc.image(qrBuffer, 445, sectionY - 15, { width: 90 });
        doc.fillColor('#000000');
      }

      doc
        .fontSize(8)
        .font('Helvetica')
        .text(footerText, 50, doc.page.height - 50, { align: 'center' });

      doc.end();
    };

    void render().catch(reject);
  });
}
