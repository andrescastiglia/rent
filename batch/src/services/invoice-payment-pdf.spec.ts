import PDFDocument from "pdfkit";
import { appendInvoicePaymentQr } from "./invoice-payment-pdf";

describe("appendInvoicePaymentQr", () => {
  it("renders a payment QR into a PDF", async () => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 40 });
    doc.on("data", (chunk: Buffer | Uint8Array) =>
      chunks.push(Buffer.from(chunk)),
    );
    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    await appendInvoicePaymentQr(
      doc,
      "https://rent.example.com/es/invoices/invoice-1?pay=mercadopago",
    );
    doc.end();

    expect((await completed).length).toBeGreaterThan(1_000);
  });

  it("does nothing without a payment URL", async () => {
    const doc = new PDFDocument();
    const initialY = doc.y;

    await appendInvoicePaymentQr(doc, null);

    expect(doc.y).toBe(initialY);
    doc.end();
  });
});
