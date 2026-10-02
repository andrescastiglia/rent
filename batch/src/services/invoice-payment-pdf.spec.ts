import PDFDocument from "pdfkit";
import QRCode from "qrcode";
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
  }, 15_000);

  it("does nothing without a payment URL", async () => {
    const doc = new PDFDocument();
    const initialY = doc.y;

    await appendInvoicePaymentQr(doc, null);

    expect(doc.y).toBe(initialY);
    doc.end();
  });

  it("starts a new page when the QR section cannot fit and preserves its authenticated link", async () => {
    const doc = new PDFDocument({ margin: 40 });
    doc.y = doc.page.height - 100;
    const addPage = jest.spyOn(doc, "addPage");
    const text = jest.spyOn(doc, "text");
    const link = "https://rent.example.com/es/invoices/invoice-42";
    await appendInvoicePaymentQr(doc, link);
    expect(addPage).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledWith(
      link,
      40,
      expect.any(Number),
      expect.objectContaining({ link, underline: true }),
    );
    doc.end();
  }, 15_000);

  it("propagates QR encoding failure rather than publishing an incomplete payment instruction", async () => {
    const error = new Error("QR encoding unavailable");
    const encode = jest
      .spyOn(QRCode, "toBuffer")
      .mockRejectedValueOnce(error as never);
    const doc = new PDFDocument({ margin: 40 });
    try {
      await expect(
        appendInvoicePaymentQr(doc, "https://rent.example/pay"),
      ).rejects.toBe(error);
    } finally {
      encode.mockRestore();
      doc.end();
    }
  });
});
