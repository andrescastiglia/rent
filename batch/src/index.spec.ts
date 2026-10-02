const mockDb = { initializeDatabase: jest.fn(), closeDatabase: jest.fn() };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockJob = {
  startJob: jest.fn(),
  completeJob: jest.fn(),
  failJob: jest.fn(),
};
const mockMetrics = jest.fn();
const mockProfiling = { startProfiling: jest.fn(), stopProfiling: jest.fn() };
const mockTracing = { startTracing: jest.fn(), shutdownTracing: jest.fn() };
const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
};
const mockActiveSpan = jest.fn();
const mockBilling = { runBilling: jest.fn(), processOverdue: jest.fn() };
const mockInvoice = {
  findOverdue: jest.fn(),
  findPendingDueSoon: jest.fn(),
  getReminderContact: jest.fn(),
};
const mockWhatsapp = {
  sendTemplateMessage: jest.fn(),
  processWebhookInbox: jest.fn(),
  applyRetentionPolicy: jest.fn(),
};
const mockRenewal = { processDueRenewals: jest.fn() };
const mockIndices = {
  syncAll: jest.fn(),
  syncIcl: jest.fn(),
  syncIpc: jest.fn(),
  syncIgpm: jest.fn(),
};
const mockRates = { syncRates: jest.fn() };
const mockReport = {
  generateMonthlySummary: jest.fn(),
  generateSettlement: jest.fn(),
};
const mockBank = { process: jest.fn() };
const mockSettlement = {
  getPendingSettlements: jest.fn(),
  processSettlement: jest.fn(),
  calculateSettlement: jest.fn(),
};
const mockRag = jest.fn();
const mockNewRelic = jest.fn();
jest.mock("newrelic", () => {
  mockNewRelic();
  return {};
});
jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { ERROR: 2, OK: 1 },
  trace: {
    getTracer: () => ({
      startActiveSpan: (...args: unknown[]) => mockActiveSpan(...args),
    }),
  },
}));
jest.mock("./shared/database", () => mockDb);
jest.mock("./shared/logger", () => ({ logger: mockLogger }));
jest.mock("./shared/metrics", () => ({
  batchMetrics: { recordJobRun: (...args: unknown[]) => mockMetrics(...args) },
}));
jest.mock("./shared/profiling", () => mockProfiling);
jest.mock("./shared/tracing", () => mockTracing);
jest.mock("./services/billing-job.service", () => ({
  BillingJobService: class {
    constructor() {
      return mockJob;
    }
  },
}));
jest.mock("./services/billing.service", () => ({
  BillingService: class {
    constructor() {
      return mockBilling;
    }
  },
}));
jest.mock("./services/invoice.service", () => ({
  InvoiceService: class {
    constructor() {
      return mockInvoice;
    }
  },
}));
jest.mock("./services/whatsapp.service", () => ({
  WhatsappService: class {
    constructor() {
      return mockWhatsapp;
    }
  },
}));
jest.mock("./services/lease-renewal.service", () => ({
  LeaseRenewalService: class {
    constructor() {
      return mockRenewal;
    }
  },
}));
jest.mock("./services/indices-sync.service", () => ({
  IndicesSyncService: class {
    constructor() {
      return mockIndices;
    }
  },
}));
jest.mock("./services/exchange-rate.service", () => ({
  ExchangeRateService: class {
    constructor() {
      return mockRates;
    }
  },
}));
jest.mock("./services/report.service", () => ({
  ReportService: class {
    constructor() {
      return mockReport;
    }
  },
}));
jest.mock("./services/bank-reconciliation.service", () => ({
  BankReconciliationBatchService: class {
    constructor() {
      return mockBank;
    }
  },
}));
jest.mock("./services/settlement.service", () => ({
  SettlementService: class {
    constructor() {
      return mockSettlement;
    }
  },
}));
jest.mock("./services/rag/rag-cli", () => ({
  registerRagCommands: (...args: unknown[]) => mockRag(...args),
}));

describe("batch CLI orchestration", () => {
  const env = { ...process.env };
  const argv = [...process.argv];
  const consoleError = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  let output: string;
  const summary = { recordsTotal: 2, recordsProcessed: 2, recordsFailed: 0 };
  const pendingInvoice = {
    id: "invoice",
    companyId: "company",
    invoiceNumber: "F-1",
    dueDate: new Date(Date.now() + 2 * 86400000),
    currencyCode: "ARS",
    total: 100,
  };

  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
    process.exitCode = undefined;
    consoleError.mockImplementation(() => undefined);
    process.env = { ...env };
    delete process.env.NEW_RELIC_LICENSE_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    process.argv = ["node", "batch-test"];
    output = "";
    mockActiveSpan.mockImplementation((_name, _options, action) =>
      action(mockSpan),
    );
    mockDb.initializeDatabase.mockResolvedValue(undefined);
    mockDb.closeDatabase.mockResolvedValue(undefined);
    mockJob.startJob.mockResolvedValue("job");
    mockJob.completeJob.mockResolvedValue(undefined);
    mockJob.failJob.mockResolvedValue(undefined);
    mockMetrics.mockResolvedValue(undefined);
    for (const fn of [
      ...Object.values(mockProfiling),
      ...Object.values(mockTracing),
    ])
      fn.mockResolvedValue(undefined);
    mockBilling.runBilling.mockResolvedValue({
      processedLeases: 2,
      invoicesProcessed: 2,
      invoicesFailed: 0,
      invoicesSkipped: 0,
      totals: {},
      errors: [],
    });
    mockBilling.processOverdue.mockResolvedValue({ markedOverdue: 2 });
    mockInvoice.findOverdue.mockResolvedValue([pendingInvoice]);
    mockInvoice.findPendingDueSoon.mockResolvedValue([pendingInvoice]);
    mockInvoice.getReminderContact.mockResolvedValue({
      tenantId: "tenant",
      tenantPhone: "123",
      tenantName: "Ana",
      tenantLanguage: "es",
      whatsappEnabled: true,
    });
    mockWhatsapp.sendTemplateMessage.mockResolvedValue({ success: true });
    mockWhatsapp.processWebhookInbox.mockResolvedValue({
      processed: 2,
      failed: 0,
    });
    mockWhatsapp.applyRetentionPolicy.mockResolvedValue({ deleted: 2 });
    mockRenewal.processDueRenewals.mockResolvedValue({
      ...summary,
      whatsappSent: 0,
    });
    mockIndices.syncAll.mockResolvedValue([
      {
        indexType: "icl",
        recordsProcessed: 2,
        recordsInserted: 1,
        recordsSkipped: 1,
      },
    ]);
    for (const type of ["Icl", "Ipc", "Igpm"] as const)
      mockIndices[`sync${type}`].mockResolvedValue({
        indexType: type,
        recordsProcessed: 2,
        recordsInserted: 1,
      });
    mockRates.syncRates.mockResolvedValue({
      processed: 2,
      inserted: 1,
      errors: [],
    });
    mockReport.generateMonthlySummary.mockResolvedValue({
      success: true,
      pdfUrl: "/report.pdf",
    });
    mockReport.generateSettlement.mockResolvedValue({
      success: true,
      pdfUrl: "/settlement.pdf",
    });
    mockBank.process.mockResolvedValue(summary);
    mockSettlement.getPendingSettlements.mockResolvedValue([
      { ownerId: "owner", period: "2026-09" },
    ]);
    mockSettlement.processSettlement.mockResolvedValue({
      success: true,
      settlementId: "settlement",
    });
    mockSettlement.calculateSettlement.mockResolvedValue({
      grossAmount: 100,
      commission: { amount: 10 },
      netAmount: 90,
      scheduledDate: new Date("2026-10-07"),
    });
  });
  afterEach(() => {
    process.env = { ...env };
    process.argv = [...argv];
    process.exitCode = undefined;
  });
  afterAll(() => consoleError.mockRestore());

  async function execute(...args: string[]) {
    process.argv = ["node", "batch-test", ...args];
    const cli = await import("./index");
    cli.program.exitOverride().configureOutput({
      writeOut: (text) => {
        output += text;
      },
      writeErr: (text) => {
        output += text;
      },
    });
    for (const command of cli.program.commands) {
      command.exitOverride().configureOutput({
        writeOut: (text) => {
          output += text;
        },
        writeErr: (text) => {
          output += text;
        },
      });
    }
    await cli.main(process.argv);
  }

  it("imports without starting profiling, jobs or providers", async () => {
    await import("./index");
    expect(mockProfiling.startProfiling).not.toHaveBeenCalled();
    expect(mockDb.initializeDatabase).not.toHaveBeenCalled();
    expect(mockJob.startJob).not.toHaveBeenCalled();
  });

  it.each(["--log=/tmp/batch-cli.log", "--log"])(
    "sets the explicit log destination before the logger loads",
    async (option) => {
      const args =
        option === "--log" ? [option, "/tmp/batch-cli.log"] : [option];
      await execute(
        "billing",
        ...args,
        "--dry-run",
        "--date",
        "2026-10-01",
        "--lease-id",
        "lease",
        "--company-id",
        "company",
      );
      expect(process.env.LOG_FILE).toBe("/tmp/batch-cli.log");
      expect(mockBilling.runBilling).toHaveBeenCalledWith(
        "2026-10-01",
        true,
        "lease",
        "company",
      );
      expect(mockJob.completeJob).toHaveBeenCalledWith(
        "job",
        expect.objectContaining({ recordsProcessed: 2 }),
      );
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
      expect(mockDb.closeDatabase).toHaveBeenCalledTimes(1);
      expect(mockTracing.shutdownTracing).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the Argentine current date and reports partially failed billing", async () => {
    mockBilling.runBilling.mockResolvedValue({
      processedLeases: 2,
      invoicesProcessed: 1,
      invoicesFailed: 1,
      invoicesSkipped: 0,
      totals: {},
      errors: ["failed"],
    });
    await execute("billing");
    expect(mockBilling.runBilling).toHaveBeenCalledWith(
      expect.any(String),
      false,
      undefined,
      undefined,
    );
    expect(mockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ job: "billing", status: "failed" }),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith("Some invoices failed", {
      errorCount: 1,
    });
    expect(process.exitCode).toBe(1);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2 });
  });

  it.each([false, true])(
    "overdue preserves preview mode and completes the audited job",
    async (dryRun) => {
      await execute("overdue", ...(dryRun ? ["--dry-run"] : []));
      expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
        recordsTotal: dryRun ? 1 : 2,
        recordsProcessed: dryRun ? 0 : 2,
        recordsFailed: 0,
      });
      expect(mockBilling.processOverdue).toHaveBeenCalledTimes(dryRun ? 0 : 1);
      expect(mockInvoice.findOverdue).toHaveBeenCalledTimes(dryRun ? 1 : 0);
    },
  );

  it("sends reminders only to the consented recipient and uses an invoice-specific key", async () => {
    await execute("reminders", "--days-before", "5");
    expect(mockInvoice.findPendingDueSoon).toHaveBeenCalledWith(5);
    expect(mockWhatsapp.sendTemplateMessage).toHaveBeenCalledWith(
      "123",
      expect.objectContaining({
        templateName: "payment_reminder",
        templateLanguage: "es",
      }),
      expect.stringContaining("Hola Ana"),
      undefined,
      expect.objectContaining({
        companyId: "company",
        recipientRole: "tenant",
        recipientId: "tenant",
        relatedEntityId: "invoice",
        idempotencyKey: expect.stringContaining("payment-reminder:invoice:"),
      }),
    );
    expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
      recordsTotal: 1,
      recordsProcessed: 1,
      recordsFailed: 0,
    });
  });

  it("does not look up recipients or send messages in reminder preview", async () => {
    await execute("reminders", "--dry-run");
    expect(mockInvoice.getReminderContact).not.toHaveBeenCalled();
    expect(mockWhatsapp.sendTemplateMessage).not.toHaveBeenCalled();
    expect(mockMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" }),
    );
  });

  it.each(["tenantPhone", "tenantId", "whatsappEnabled", "companyId"])(
    "skips reminders lacking %s",
    async (field) => {
      if (field === "companyId")
        mockInvoice.findPendingDueSoon.mockResolvedValue([
          { ...pendingInvoice, companyId: null },
        ]);
      else
        mockInvoice.getReminderContact.mockResolvedValue({
          tenantPhone: "123",
          tenantId: "tenant",
          whatsappEnabled: true,
          [field]: null,
        });
      await execute("reminders");
      expect(mockWhatsapp.sendTemplateMessage).not.toHaveBeenCalled();
      expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
        recordsTotal: 1,
        recordsProcessed: 0,
        recordsFailed: 1,
      });
      expect(process.exitCode).toBe(1);
    },
  );

  it("uses fallback reminder text and records a rejected send", async () => {
    mockInvoice.getReminderContact.mockResolvedValue({
      tenantPhone: "123",
      tenantId: "tenant",
      whatsappEnabled: true,
    });
    mockInvoice.findPendingDueSoon.mockResolvedValue([
      { ...pendingInvoice, dueDate: new Date(Date.now() + 1000) },
    ]);
    mockWhatsapp.sendTemplateMessage.mockResolvedValue({ success: false });
    await execute("reminders");
    expect(mockWhatsapp.sendTemplateMessage).toHaveBeenCalledWith(
      "123",
      expect.objectContaining({
        templateLanguage: "es",
        templateParameters: expect.arrayContaining([
          "inquilino/a",
          expect.stringContaining("1 día"),
        ]),
      }),
      expect.stringContaining("Hola inquilino/a"),
      undefined,
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it.each([false, true])(
    "evaluates lease renewals with an explicit date or current date",
    async (explicitDate) => {
      mockRenewal.processDueRenewals.mockResolvedValue({
        ...summary,
        recordsFailed: explicitDate ? 1 : 0,
        whatsappSent: 0,
      });
      await execute(
        "lease-renewal-alerts",
        ...(explicitDate ? ["--date", "2026-10-01", "--dry-run"] : []),
      );
      expect(mockRenewal.processDueRenewals).toHaveBeenCalledWith(
        expect.any(Date),
        explicitDate,
      );
      expect(mockMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          job: "lease_renewal_alerts",
          status: explicitDate ? "failed" : "success",
        }),
      );
    },
  );

  it.each(["all", "icl", "ipc", "igp_m"])(
    "selects the %s inflation source and forwards date bounds",
    async (index) => {
      await execute(
        "sync-indices",
        "--index",
        index,
        "--from-date",
        "2026-09-01",
        "--to-date",
        "2026-10-01",
      );
      const method = {
        all: "syncAll",
        icl: "syncIcl",
        ipc: "syncIpc",
        igp_m: "syncIgpm",
      }[index] as keyof typeof mockIndices;
      expect(mockIndices[method]).toHaveBeenCalledWith({
        fromDate: "2026-09-01",
        toDate: "2026-10-01",
      });
      expect(mockJob.completeJob).toHaveBeenCalledWith(
        "job",
        expect.objectContaining({
          recordsTotal: 2,
          recordsProcessed: 1,
          recordsFailed: 0,
        }),
      );
    },
  );

  it("accounts for source failures separately and allows an empty successful source", async () => {
    mockIndices.syncAll.mockResolvedValue([
      { indexType: "ipc", error: "unavailable" },
      { indexType: "icl" },
    ]);
    await execute("sync-indices");
    expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
      recordsTotal: 0,
      recordsProcessed: 0,
      recordsFailed: 1,
      errorLog: [{ indexType: "ipc", error: "unavailable" }],
    });
    expect(process.exitCode).toBe(1);
  });

  it("rejects unknown index types and marks the started job failed", async () => {
    await execute("sync-indices", "--index", "unknown");
    expect(mockJob.failJob).toHaveBeenCalledWith(
      "job",
      "Invalid index type: unknown",
    );
    expect(mockIndices.syncAll).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each([{ errors: [] as string[] }, { errors: ["USD failed"] }])(
    "stores the exchange source summary and any error details",
    async ({ errors }) => {
      mockRates.syncRates.mockResolvedValue({
        processed: 2,
        inserted: 1,
        errors,
      });
      await execute("sync-rates");
      expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
        recordsTotal: 2,
        recordsProcessed: 1,
        recordsFailed: errors.length,
        errorLog: errors.map((error) => ({ error })),
      });
      expect(mockLogger.warn).toHaveBeenCalledTimes(errors.length ? 1 : 0);
    },
  );

  it.each([false, true])(
    "passes monthly-report preview through to the service and job counters",
    async (dryRun) => {
      await execute(
        "reports",
        "--owner-id",
        "owner",
        "--month",
        "2026-09",
        ...(dryRun ? ["--dry-run"] : []),
      );
      expect(mockReport.generateMonthlySummary).toHaveBeenCalledWith(
        "owner",
        2026,
        9,
        dryRun,
      );
      expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
        recordsTotal: 1,
        recordsProcessed: dryRun ? 0 : 1,
        recordsFailed: 0,
        recordsSkipped: dryRun ? 1 : 0,
      });
    },
  );

  it("defaults the report month and keeps settlement preview out of delivery", async () => {
    await execute(
      "reports",
      "--owner-id",
      "owner",
      "--type",
      "settlement",
      "--dry-run",
    );
    expect(mockReport.generateSettlement).toHaveBeenCalledWith(
      "owner",
      expect.any(String),
      true,
    );
  });

  it("records a domain report failure without calling job fail twice", async () => {
    mockReport.generateMonthlySummary.mockResolvedValue({
      success: false,
      error: "missing owner",
    });
    await execute("reports", "--owner-id", "owner");
    expect(mockJob.completeJob).toHaveBeenCalledWith(
      "job",
      expect.objectContaining({
        recordsFailed: 1,
        errorLog: [{ error: "missing owner" }],
      }),
    );
    expect(mockJob.failJob).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each([
    { args: [] as string[] },
    { args: ["--owner-id", "owner", "--type", "unknown"] },
  ])(
    "rejects an incomplete or unsupported report request",
    async ({ args }) => {
      await execute("reports", ...args);
      expect(mockJob.failJob).toHaveBeenCalledWith(
        "job",
        expect.stringMatching(/Owner ID required|Report type must/),
      );
      expect(mockReport.generateMonthlySummary).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1])(
    "passes bank scope, bounds and preview through and reports failures",
    async (failed) => {
      mockBank.process.mockResolvedValue({ ...summary, recordsFailed: failed });
      await execute(
        "reconcile-bank",
        "--company-id",
        "company",
        "--limit",
        "4",
        "--min-age-minutes",
        "0",
        "--dry-run",
      );
      expect(mockBank.process).toHaveBeenCalledWith({
        companyId: "company",
        limit: 4,
        minAgeMinutes: 0,
        dryRun: true,
      });
      expect(mockMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ status: failed ? "failed" : "success" }),
      );
    },
  );

  it.each([
    ["process-whatsapp-inbox", "--limit", "0"],
    ["process-whatsapp-inbox", "--limit", "1.5"],
    ["reconcile-bank", "--limit", "oops"],
    ["reconcile-bank", "--min-age-minutes", "-1"],
  ])(
    "rejects invalid numeric CLI bounds before executing a service",
    async (...args) => {
      await execute(...args);
      expect(output).toContain("integer");
      expect(mockDb.initializeDatabase).not.toHaveBeenCalled();
      expect(mockWhatsapp.processWebhookInbox).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    },
  );

  it.each([0, 1])(
    "processes the inbox bounded by the validated limit",
    async (failed) => {
      mockWhatsapp.processWebhookInbox.mockResolvedValue({
        processed: 2,
        failed,
      });
      await execute("process-whatsapp-inbox", "--limit", "2");
      expect(mockWhatsapp.processWebhookInbox).toHaveBeenCalledWith(2);
      expect(process.exitCode).toBe(failed ? 1 : undefined);
    },
  );

  it("applies retention without opening the billing database", async () => {
    await execute("apply-whatsapp-retention");
    expect(mockWhatsapp.applyRetentionPolicy).toHaveBeenCalledTimes(1);
    expect(mockDb.initializeDatabase).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "uses single-owner settlement preview or retired processing entry",
    async (dryRun) => {
      await execute(
        "process-settlements",
        "--owner-id",
        "owner",
        "--period",
        "2026-09",
        ...(dryRun ? ["--dry-run"] : []),
      );
      if (dryRun) {
        expect(mockSettlement.processSettlement).not.toHaveBeenCalled();
        expect(mockSettlement.calculateSettlement).toHaveBeenCalledWith(
          "owner",
          "2026-09",
        );
      } else
        expect(mockSettlement.processSettlement).toHaveBeenCalledWith(
          "owner",
          "2026-09",
          false,
        );
      expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
        recordsTotal: 1,
        recordsProcessed: dryRun ? 0 : 1,
        recordsFailed: 0,
      });
    },
  );

  it("keeps an explicit failed settlement out of processed counters", async () => {
    mockSettlement.processSettlement.mockResolvedValue({ success: false });
    await execute("process-settlements", "--owner-id", "owner");
    expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
      recordsTotal: 1,
      recordsProcessed: 0,
      recordsFailed: 1,
    });
    expect(process.exitCode).toBe(1);
  });

  it.each([
    { args: ["--dry-run"] },
    { args: [] as string[] },
    { args: ["--process"] },
  ])(
    "aggregates pending owner previews and failures consistently",
    async ({ args }) => {
      mockSettlement.getPendingSettlements.mockResolvedValue([
        { ownerId: "first", period: "2026-09" },
        { ownerId: "second", period: "2026-08" },
      ]);
      mockSettlement.processSettlement
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValueOnce({ success: true });
      await execute("process-settlements", ...args);
      const dryRun = args.includes("--dry-run");
      expect(mockJob.completeJob).toHaveBeenCalledWith("job", {
        recordsTotal: 2,
        recordsProcessed: dryRun ? 2 : 1,
        recordsFailed: dryRun ? 0 : 1,
      });
      expect(mockSettlement.calculateSettlement).toHaveBeenCalledWith(
        "second",
        "2026-08",
      );
    },
  );

  const failingCommands = [
    ["billing", mockBilling.runBilling],
    ["overdue", mockBilling.processOverdue],
    ["reminders", mockInvoice.findPendingDueSoon],
    ["lease-renewal-alerts", mockRenewal.processDueRenewals],
    ["sync-indices", mockIndices.syncAll],
    ["sync-rates", mockRates.syncRates],
    ["reports", mockReport.generateMonthlySummary],
    ["reconcile-bank", mockBank.process],
    ["process-settlements", mockSettlement.getPendingSettlements],
  ] as const;
  it.each(failingCommands)(
    "%s records a thrown domain failure and still closes the database",
    async (command, method) => {
      method.mockRejectedValue("unexpected failure");
      await execute(
        command,
        ...(command === "reports" ? ["--owner-id", "owner"] : []),
      );
      if (command !== "lease-renewal-alerts")
        expect(mockJob.failJob).toHaveBeenCalledWith("job", "Unknown error");
      expect(mockMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
      expect(mockDb.closeDatabase).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    },
  );

  it.each(failingCommands)(
    "%s handles initialization failure before a job exists",
    async (command) => {
      mockDb.initializeDatabase.mockRejectedValue(
        new Error("database unavailable"),
      );
      await execute(
        command,
        ...(command === "reports" ? ["--owner-id", "owner"] : []),
      );
      expect(mockJob.failJob).not.toHaveBeenCalled();
      expect(mockDb.closeDatabase).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    },
  );

  it("ends and marks the trace when final cleanup throws", async () => {
    mockDb.closeDatabase.mockRejectedValue(new Error("close failed"));
    await execute("billing");
    expect(mockSpan.recordException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "close failed" }),
    );
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: "close failed",
    });
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Fatal error starting batch",
      expect.any(Object),
    );
  });

  it("uses console diagnostics when profiling fails before logger initialization", async () => {
    mockProfiling.startProfiling.mockRejectedValue(
      new Error("profiling failed"),
    );
    await execute("billing");
    expect(consoleError).toHaveBeenCalledWith(
      "Fatal error starting batch",
      expect.objectContaining({ message: "profiling failed" }),
    );
    expect(mockTracing.shutdownTracing).toHaveBeenCalledTimes(1);
    expect(mockProfiling.stopProfiling).toHaveBeenCalledTimes(1);
  });

  it("shows command help without running a job", async () => {
    await execute("--help");
    expect(output).toContain("Generate invoices");
    expect(mockJob.startJob).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "selects New Relic only when OTLP tracing is absent",
    async (otlp) => {
      process.env.NEW_RELIC_LICENSE_KEY = "test-license";
      delete process.env.NEW_RELIC_ENABLED;
      delete process.env.OTEL_SDK_DISABLED;
      if (otlp) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://collector";
      await import("./index");
      expect(mockNewRelic).toHaveBeenCalledTimes(otlp ? 0 : 1);
    },
  );
});
