import { buildInvoicePaymentNotification } from "./invoice-payment-notification";

describe("buildInvoicePaymentNotification", () => {
  const baseInput = {
    tenantName: "Ada Tenant",
    invoiceNumber: "FAC-1",
    dueDate: "2026-08-10",
    totalAmount: "ARS 100,00",
  };

  it("includes the MercadoPago payment link", () => {
    expect(
      buildInvoicePaymentNotification({
        ...baseInput,
        paymentLink:
          "https://rent.example.com/es/invoices/invoice-1?pay=mercadopago",
      }),
    ).toContain(
      "Pagar con MercadoPago: https://rent.example.com/es/invoices/invoice-1?pay=mercadopago",
    );
  });

  it("keeps the message useful without a payment link", () => {
    const message = buildInvoicePaymentNotification({
      ...baseInput,
      paymentLink: null,
    });

    expect(message).toContain("tu factura FAC-1 ya está disponible");
    expect(message).not.toContain("Pagar con MercadoPago");
  });
});
