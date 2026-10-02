import { InvoiceService } from "./invoice.service";
import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { buildInvoicePaymentUrl } from "./invoice-payment-link";

jest.mock("../shared/database", () => ({
  AppDataSource: { query: jest.fn() },
}));
jest.mock("../shared/logger", () => ({ logger: { info: jest.fn() } }));
jest.mock("./invoice-payment-link", () => ({
  buildInvoicePaymentUrl: jest.fn(),
}));

describe("InvoiceService", () => {
  const service = new InvoiceService();
  const query = AppDataSource.query as jest.Mock;
  const row = {
    id: "invoice",
    company_id: "company",
    lease_id: "lease",
    owner_id: "owner",
    tenant_account_id: "account",
    invoice_number: "F-1",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    subtotal: "100.00",
    total_amount: "105.00",
    paid_amount: "25.00",
    due_date: "2026-09-05",
    status: "partial",
    created_at: "2026-08-01",
  };

  beforeEach(() => jest.clearAllMocks());

  it("maps current schema amounts and forwards the due interval as a parameter", async () => {
    query.mockResolvedValue([
      {
        ...row,
        late_fee_amount: "7.50",
        discount_amount: 2.5,
        currency: "USD",
        issue_date: "2026-08-02",
        original_amount: "50",
        original_currency: "USD",
        exchange_rate: "2.1",
        withholding_iibb: "1.2",
        withholding_iva: 2,
        withholding_ganancias: 3n,
        withholdings_total: "6.2",
        pdf_url: "/invoice.pdf",
      },
    ]);
    const invoices = await service.findPendingDueSoon(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("i.deleted_at IS NULL"),
      ["3 days"],
    );
    expect(invoices[0]).toMatchObject({
      id: "invoice",
      companyId: "company",
      subtotal: 100,
      total: 105,
      amountPaid: 25,
      lateFee: 7.5,
      adjustments: 2.5,
      currencyCode: "USD",
      originalAmount: 50,
      exchangeRateUsed: 2.1,
      withholdingIibb: 1.2,
      withholdingIva: 2,
      withholdingGanancias: 3,
      withholdingsTotal: 6.2,
      pdfUrl: "/invoice.pdf",
      issuedAt: new Date("2026-08-02"),
    });
  });

  it("reads historical columns and defaults optional values without inventing issued dates", async () => {
    query.mockResolvedValue([
      {
        ...row,
        paid_amount: null,
        amount_paid: "10",
        late_fee: 5,
        adjustments: "1",
        currency_code: "BRL",
        issued_at: "2026-08-03",
        exchange_rate_used: "3",
      },
      row,
    ]);
    const invoices = await service.findOverdue();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("due_date < CURRENT_DATE"),
    );
    expect(invoices[0]).toMatchObject({
      amountPaid: 10,
      lateFee: 5,
      adjustments: 1,
      currencyCode: "BRL",
      issuedAt: new Date("2026-08-03"),
      exchangeRateUsed: 3,
    });
    expect(invoices[1]).toMatchObject({
      lateFee: 0,
      adjustments: 0,
      currencyCode: "ARS",
      withholdingIibb: 0,
      withholdingsTotal: 0,
    });
    expect(invoices[1].issuedAt).toBeUndefined();
    expect(invoices[1].originalAmount).toBeUndefined();
    expect(invoices[1].exchangeRateUsed).toBeUndefined();
    expect(invoices[1].pdfUrl).toBeUndefined();
  });

  it("does not stringify objects received in optional scalar columns", async () => {
    query.mockResolvedValue([
      { ...row, currency: {}, late_fee: {}, adjustments: false },
    ]);
    const [invoice] = await service.findOverdue();
    expect(invoice.currencyCode).toBe("ARS");
    expect(invoice.lateFee).toBe(0);
    expect(Number.isNaN(invoice.adjustments)).toBe(true);
  });

  it("returns consent only for explicit true and represents missing contacts as null", async () => {
    query
      .mockResolvedValueOnce([
        {
          tenant_id: "tenant",
          tenant_phone: "123",
          tenant_name: "Ana",
          tenant_language: "es",
          whatsapp_enabled: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ whatsapp_enabled: "true" }]);
    expect(await service.getReminderContact("invoice")).toEqual({
      tenantId: "tenant",
      tenantPhone: "123",
      tenantName: "Ana",
      tenantLanguage: "es",
      whatsappEnabled: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE i.id = $1"),
      ["invoice"],
    );
    expect(await service.getReminderContact("missing")).toEqual({
      tenantId: null,
      tenantPhone: null,
      tenantName: null,
      tenantLanguage: null,
      whatsappEnabled: false,
    });
    expect((await service.getReminderContact("legacy")).whatsappEnabled).toBe(
      false,
    );
  });

  it.each([[[{ id: "a" }, { id: "b" }]], [[[{ id: "a" }, { id: "b" }], 2]]])(
    "counts RETURNING rows for both supported database response formats",
    async (result) => {
      query.mockResolvedValue(result);
      expect(await service.markOverdue()).toBe(2);
      expect(logger.info).toHaveBeenCalledWith("Marked invoices as overdue", {
        count: 2,
      });
    },
  );

  it("does not announce an overdue update when no invoice changed", async () => {
    query.mockResolvedValue([]);
    expect(await service.markOverdue()).toBe(0);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("delegates payment-link construction including the default locale", () => {
    (buildInvoicePaymentUrl as jest.Mock).mockReturnValue("/pay/invoice");
    expect(service.getPaymentLink("invoice")).toBe("/pay/invoice");
    service.getPaymentLink("invoice", "en");
    expect(buildInvoicePaymentUrl).toHaveBeenNthCalledWith(1, "invoice", "es");
    expect(buildInvoicePaymentUrl).toHaveBeenNthCalledWith(2, "invoice", "en");
  });
});
