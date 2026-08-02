import QRCode from "qrcode";

export async function appendInvoicePaymentQr(
  doc: PDFKit.PDFDocument,
  paymentUrl: string | null,
): Promise<void> {
  if (!paymentUrl) {
    return;
  }

  if (doc.y > doc.page.height - 190) {
    doc.addPage();
  }
  const qrBuffer = await QRCode.toBuffer(paymentUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 180,
  });
  const sectionY = doc.y + 25;
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .text("PAGAR CON MERCADOPAGO", 40, sectionY);
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#0369a1")
    .text(paymentUrl, 40, sectionY + 20, {
      width: 330,
      link: paymentUrl,
      underline: true,
    });
  doc.image(qrBuffer, 445, sectionY - 15, { width: 90 });
  doc.fillColor("#000000");
  doc.y = Math.max(doc.y, sectionY + 90);
}
