import { ReportService } from "./report.service";
import { AppDataSource } from "../shared/database";
import { EventEmitter } from "node:events";

const mockText = jest.fn();
class MockPdf extends EventEmitter {
  y = 50;
  page = { height: 842, margins: { bottom: 50 } };
  fontSize() {
    return this;
  }
  font() {
    return this;
  }
  text(...args: unknown[]) {
    mockText(...args);
    this.y += 12;
    return this;
  }
  moveDown() {
    this.y += 16;
    return this;
  }
  addPage() {
    this.y = 50;
    return this;
  }
  end() {
    this.emit("data", Buffer.from("%PDF-1.7"));
    this.emit("end");
  }
}
jest.mock("pdfkit", () => ({
  __esModule: true,
  default: jest.fn(() => new MockPdf()),
}));
jest.mock("../shared/database", () => ({
  AppDataSource: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../shared/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

const owner = {
  companyId: "company-1",
  name: "Owner without portal access",
  taxId: "123",
};
const invoice = {
  invoiceNumber: "F-1",
  tenantName: "Tenant",
  propertyAddress: "Street 42",
  currency: "ARS",
  subtotal: "100.00",
  withholdings: "0.00",
  total: "100.00",
  paid: "25.00",
  collected: "25.00",
  credited: "0.00",
  status: "partial",
};
const settlement = {
  id: "S-1",
  currency: "ARS",
  status: "completed",
  grossAmount: "25.00",
  commissionAmount: "2.00",
  withholdingsAmount: "1.00",
  netAmount: "22.00",
  invoices: [{ invoiceNumber: "F-1", grossAmount: "25.00" }],
};
const query = AppDataSource.query as jest.Mock;
const transaction = AppDataSource.transaction as jest.Mock;
let service: ReportService;
beforeEach(() => {
  service = new ReportService();
  query.mockReset();
  mockText.mockClear();
  transaction.mockClear();
  transaction.mockImplementation(async (_isolation, action) =>
    action({ query }),
  );
});
function rows(data: unknown[]) {
  query
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([owner])
    .mockResolvedValueOnce(data);
}
function text() {
  return mockText.mock.calls.map(([message]) => message).join("\n");
}

describe("canonical monthly reports", () => {
  it("uses a read-only snapshot, records partial collections and separates currencies", async () => {
    rows([
      invoice,
      {
        ...invoice,
        invoiceNumber: "F-2",
        currency: "USD",
        total: "75.00",
        paid: "10.00",
        collected: "10.00",
      },
    ]);
    const result = await service.generateMonthlySummary(
      "owner-id",
      2026,
      9,
      true,
    );
    expect(result.success).toBe(true);
    expect(result.pdfBuffer?.toString()).toBe("%PDF-1.7");
    expect(text()).toContain("Cobrado: ARS 25,00");
    expect(text()).toContain("Pendiente: ARS 75,00");
    expect(text()).toContain("Totales USD");
    expect(text()).toContain("Pendiente: USD 65,00");
    expect(transaction).toHaveBeenCalledWith(
      "REPEATABLE READ",
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith("SET TRANSACTION READ ONLY");
    expect(query.mock.calls[2][1]).toEqual([
      "owner-id",
      "company-1",
      "2026-09",
    ]);
    expect(query.mock.calls[2][0]).toContain("pa.company_id=$2");
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("rejects a denormalized paid amount that does not match active allocations", async () => {
    rows([{ ...invoice, collected: "30.00" }]);
    expect(
      await service.generateMonthlySummary("owner-id", 2026, 9, true),
    ).toEqual({
      success: false,
      error: expect.stringContaining("reconciliation"),
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("subtracts issued credits from the invoice balance without recreating collections", async () => {
    rows([{ ...invoice, credited: "15.00" }]);
    expect(
      (await service.generateMonthlySummary("owner-id", 2026, 9, true)).success,
    ).toBe(true);
    expect(text()).toContain("Total: ARS 85,00");
    expect(text()).toContain("Pendiente: ARS 60,00");
  });
  it("prints an explicit empty period, without inventing a balance", async () => {
    rows([]);
    await service.generateMonthlySummary("owner-id", 2026, 9, true);
    expect(text()).toContain("No hay facturas");
    expect(text()).not.toContain("Totales");
  });
});
describe("recorded settlement reports", () => {
  it("reads actual commissions and net amounts, never a hardcoded commission", async () => {
    rows([
      settlement,
      {
        ...settlement,
        id: "S-2",
        currency: "USD",
        grossAmount: "100.00",
        commissionAmount: "12.50",
        withholdingsAmount: "0.00",
        netAmount: "87.50",
      },
    ]);
    expect(
      (await service.generateSettlement("owner-id", "2026-09", true)).success,
    ).toBe(true);
    expect(text()).toContain("Comisión registrada: ARS 2,00");
    expect(text()).toContain("Comisión registrada: USD 12,50");
    expect(text()).toContain("Neto registrado: USD 87,50");
    expect(text()).toContain("F-1: ARS 25,00");
    expect(query.mock.calls[2][0]).toContain("settlement_generations");
    expect(query.mock.calls[2][1]).toEqual([
      "owner-id",
      "company-1",
      "2026-09",
    ]);
  });
  it("labels historical settlements without source snapshots for reconciliation", async () => {
    rows([{ ...settlement, invoices: [] }]);
    await service.generateSettlement("owner-id", "2026-09", true);
    expect(text()).toContain("Liquidación histórica");
  });
  it("rejects inconsistent persisted financial totals", async () => {
    rows([{ ...settlement, netAmount: "24.00" }]);
    expect(
      (await service.generateSettlement("owner-id", "2026-09", true)).success,
    ).toBe(false);
  });
  it("does not infer a payable settlement when none was generated", async () => {
    rows([]);
    await service.generateSettlement("owner-id", "2026-09", true);
    expect(text()).toContain("no calcula ni autoriza transferencias");
  });
});
describe("report failures and persistence", () => {
  it("keeps a non-Error database failure visible to operators", async () => {
    transaction.mockRejectedValueOnce("Database snapshot unavailable");
    expect(
      await service.generateSettlement("owner-id", "2026-09", true),
    ).toEqual({ success: false, error: "Database snapshot unavailable" });
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER])(
    "rejects numeric accounting amounts that cannot be represented safely in cents: %s",
    async (amount) => {
      rows([{ ...invoice, total: amount }]);
      expect(
        (await service.generateMonthlySummary("owner-id", 2026, 9, true))
          .success,
      ).toBe(false);
    },
  );
  it("requires invoice currency and accounting status evidence", async () => {
    rows([{ ...invoice, currency: null }]);
    expect(
      (await service.generateMonthlySummary("owner-id", 2026, 9, true)).error,
    ).toBe("Missing invoice currency");
    rows([{ ...invoice, status: null }]);
    expect(
      (await service.generateMonthlySummary("owner-id", 2026, 9, true)).error,
    ).toBe("Invalid accounting text");
  });
  it("paginates long reports without losing invoice rows or currency totals", async () => {
    rows(
      Array.from({ length: 40 }, (_, index) => ({
        ...invoice,
        invoiceNumber: `F-${index + 1}`,
      })),
    );
    const addPage = jest.spyOn(MockPdf.prototype, "addPage");
    try {
      expect(
        (await service.generateMonthlySummary("owner-id", 2026, 9, true))
          .success,
      ).toBe(true);
      expect(addPage).toHaveBeenCalled();
      expect(text()).toContain("F-40");
      expect(text()).toContain("Cobrado: ARS 1.000,00");
    } finally {
      addPage.mockRestore();
    }
  });
  it("persists recorded settlements even when the owner has no tax identity", async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...owner, taxId: undefined }])
      .mockResolvedValueOnce([settlement])
      .mockResolvedValueOnce([{ ...owner, taxId: undefined }])
      .mockResolvedValueOnce([{ id: "settlement-document" }]);
    expect(await service.generateSettlement("owner-id", "2026-09")).toEqual({
      success: true,
      pdfUrl: "db://document/settlement-document",
    });
    expect(text()).not.toContain("CUIT:");
    expect(query.mock.calls[4][1][2]).toBe("Liquidaciones 2026-09");
  });
  it.each(["2026-00", "2026-13", "not-a-period", "2026-9"])(
    "rejects invalid period %s before accessing the database",
    async (period) => {
      expect(
        (await service.generateSettlement("owner-id", period)).success,
      ).toBe(false);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it("rejects a user ID masquerading as an owner ID", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await service.generateSettlement("user-id", "2026-09");
    expect(result.error).toContain("Owner not found");
    expect(query.mock.calls[1][0]).toContain("WHERE o.id=$1");
    expect(query.mock.calls[1][0]).not.toContain("OR user_id");
  });
  it.each([null, "", "-1.00", "NaN", "Infinity", true, {}, " "])(
    "fails instead of replacing invalid accounting amounts with zero: %s",
    async (amount) => {
      rows([{ ...invoice, total: amount }]);
      expect(
        (await service.generateMonthlySummary("owner-id", 2026, 9, true))
          .success,
      ).toBe(false);
    },
  );
  it("requires an explicit currency", async () => {
    rows([{ ...settlement, currency: null }]);
    expect(
      (await service.generateSettlement("owner-id", "2026-09", true)).success,
    ).toBe(false);
  });
  it("atomically persists the final URL with the PDF in the owner company", async () => {
    rows([invoice]);
    query
      .mockResolvedValueOnce([owner])
      .mockResolvedValueOnce([{ id: "document-id" }]);
    expect(await service.generateMonthlySummary("owner-id", 2026, 9)).toEqual({
      success: true,
      pdfUrl: "db://document/document-id",
    });
    const [sql, params] = query.mock.calls[4];
    expect(sql).toContain("'db://document/' || id::text");
    expect(params[0]).toBe("company-1");
    expect(params[4]).toBe("owner-id");
  });
  it("reports storage failure and cannot pretend the document was generated", async () => {
    rows([invoice]);
    query.mockResolvedValueOnce([owner]).mockResolvedValueOnce([]);
    expect(
      (await service.generateMonthlySummary("owner-id", 2026, 9)).success,
    ).toBe(false);
  });
});
