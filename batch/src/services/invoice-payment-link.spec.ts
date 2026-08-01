import { buildInvoicePaymentUrl } from "./invoice-payment-link";

describe("buildInvoicePaymentUrl", () => {
  it("builds the invoice checkout URL", () => {
    expect(
      buildInvoicePaymentUrl("invoice-1", "en", "https://rent.example.com"),
    ).toBe("https://rent.example.com/en/invoices/invoice-1?pay=mercadopago");
  });

  it("returns null without a valid frontend origin", () => {
    expect(buildInvoicePaymentUrl("invoice-1", "es", undefined)).toBeNull();
    expect(buildInvoicePaymentUrl("invoice-1", "es", "invalid")).toBeNull();
  });

  it("uses the first configured origin and falls back to Spanish", () => {
    expect(
      buildInvoicePaymentUrl(
        "invoice/with spaces",
        "fr",
        "https://rent.example.com, https://admin.example.com",
      ),
    ).toBe(
      "https://rent.example.com/es/invoices/invoice%2Fwith%20spaces?pay=mercadopago",
    );
  });
});
