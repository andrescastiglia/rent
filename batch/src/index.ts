#!/usr/bin/env node
import "reflect-metadata";
import { config } from "dotenv";
import { Command } from "commander";
import type { BillingJobService } from "./services/billing-job.service";
import { batchMetrics } from "./shared/metrics";

// Load environment variables
config();

// Early CLI parsing for `--log <file>` so logger can pick it up on import.
// Supports `--log=/path/to/file.log` or `--log /path/to/file.log`.
const rawArgs = process.argv.slice(2);
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a.startsWith("--log=")) {
    process.env.LOG_FILE = a.split("=")[1];
    break;
  }
  if (a === "--log" && i + 1 < rawArgs.length) {
    process.env.LOG_FILE = rawArgs[i + 1];
    break;
  }
}

// Singleton instance for job logging
let billingJobService: BillingJobService;

let BillingJobServiceCtor: (new () => BillingJobService) | undefined;

function newBillingJobService(): BillingJobService {
  if (!BillingJobServiceCtor) {
    throw new Error("BillingJobService not loaded");
  }
  return new BillingJobServiceCtor();
}

let initializeDatabase: () => Promise<unknown> = async () => {
  throw new Error("Database module not loaded");
};
let closeDatabase: () => Promise<void> = async () => {
  // no-op until loaded
};

const program = new Command();

// Import logger after potential `process.env.LOG_FILE` is set.
// Use dynamic import inside main() so ESLint does not complain about require().
let logger: any;

async function processReminderInvoice(
  invoiceService: any,
  whatsappService: any,
  invoice: any,
  dryRun: boolean,
): Promise<{ sent: number; failed: number }> {
  const daysUntilDue = Math.ceil(
    (new Date(invoice.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  if (dryRun) {
    logger.info("Dry run: would send reminder", {
      invoiceNumber: invoice.invoiceNumber,
      daysUntilDue,
    });
    return { sent: 1, failed: 0 };
  }

  const contact = await invoiceService.getReminderContact(invoice.id);
  if (!contact.tenantPhone) {
    logger.warn("Skipping reminder without tenant phone", {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });
    return { sent: 0, failed: 1 };
  }

  const tenantName = contact.tenantName || "inquilino/a";
  const text = [
    `Hola ${tenantName},`,
    `recordatorio de pago de la factura ${invoice.invoiceNumber}.`,
    `Vence en ${daysUntilDue} ${daysUntilDue === 1 ? "día" : "días"} (${invoice.dueDate.toISOString().slice(0, 10)}).`,
    `Monto: ${invoice.currencyCode} ${invoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`,
  ].join(" ");

  const result = await whatsappService.sendTextMessage(
    contact.tenantPhone,
    text,
  );
  return result.success ? { sent: 1, failed: 0 } : { sent: 0, failed: 1 };
}

async function runReminders(
  invoiceService: any,
  whatsappService: any,
  daysBefore: number,
  dryRun: boolean,
): Promise<{ total: number; sent: number; failed: number }> {
  const pendingInvoices = await invoiceService.findPendingDueSoon(daysBefore);
  let sent = 0;
  let failed = 0;

  for (const invoice of pendingInvoices) {
    const result = await processReminderInvoice(
      invoiceService,
      whatsappService,
      invoice,
      dryRun,
    );
    sent += result.sent;
    failed += result.failed;
  }

  return { total: pendingInvoices.length, sent, failed };
}

type SyncIndicesSummary = {
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  errorLog: object[];
};

function logSyncIndexError(
  indexType: string,
  error: string,
  summary: {
    totalErrors: number;
    errorLog: object[];
  },
): void {
  logger.error(`${indexType.toUpperCase()} sync failed`, { error });
  summary.totalErrors++;
  summary.errorLog.push({ indexType, error });
}

function accumulateSyncIndexSuccess(
  result: {
    recordsProcessed?: number;
    recordsInserted?: number;
    recordsSkipped?: number;
    latestPeriod?: string;
    indexType: string;
  },
  summary: {
    totalProcessed: number;
    totalInserted: number;
  },
): void {
  logger.info(`${result.indexType.toUpperCase()} sync completed`, {
    processed: result.recordsProcessed,
    inserted: result.recordsInserted,
    skipped: result.recordsSkipped,
    latestPeriod: result.latestPeriod,
  });
  summary.totalProcessed += result.recordsProcessed || 0;
  summary.totalInserted += result.recordsInserted || 0;
}

async function runAllIndicesSync(
  syncService: any,
): Promise<SyncIndicesSummary> {
  const results = await syncService.syncAll();
  const summary = {
    totalProcessed: 0,
    totalInserted: 0,
    totalErrors: 0,
    errorLog: [] as object[],
  };

  for (const result of results) {
    if (result.error) {
      logSyncIndexError(result.indexType, result.error, summary);
      continue;
    }
    accumulateSyncIndexSuccess(result, summary);
  }

  return {
    recordsTotal: summary.totalProcessed,
    recordsProcessed: summary.totalInserted,
    recordsFailed: summary.totalErrors,
    errorLog: summary.errorLog,
  };
}

async function runSingleIndexSync(
  syncService: any,
  index: "icl" | "ipc",
): Promise<SyncIndicesSummary> {
  const result =
    index === "icl" ? await syncService.syncIcl() : await syncService.syncIpc();

  logger.info(`${index.toUpperCase()} sync completed`, {
    processed: result.recordsProcessed,
    inserted: result.recordsInserted,
    skipped: result.recordsSkipped,
    latestPeriod: result.latestPeriod,
  });

  return {
    recordsTotal: result.recordsProcessed || 0,
    recordsProcessed: result.recordsInserted || 0,
    recordsFailed: 0,
    errorLog: [],
  };
}

async function runSyncIndices(
  syncService: any,
  index: string,
): Promise<SyncIndicesSummary> {
  if (index === "all") {
    return runAllIndicesSync(syncService);
  }

  if (index === "icl" || index === "ipc") {
    return runSingleIndexSync(syncService, index);
  }

  throw new Error(`Invalid index type: ${index}`);
}

async function processPendingSettlements(settlementService: any) {
  const pending = await settlementService.getPendingSettlements();
  let processed = 0;
  let failed = 0;
  let totalAmount = 0;

  for (const { ownerId, period: settlementPeriod } of pending) {
    const processedSettlement = await processAndAccumulateSettlement(
      settlementService,
      ownerId,
      settlementPeriod,
    );

    if (!processedSettlement.success) {
      failed++;
      continue;
    }

    processed++;
    totalAmount += processedSettlement.netAmount;
  }

  logger.info("Settlements processed", {
    processed,
    failed,
    totalAmount,
  });

  return {
    recordsTotal: pending.length,
    recordsProcessed: processed,
    recordsFailed: failed,
  };
}

async function processAndAccumulateSettlement(
  settlementService: any,
  ownerId: string,
  period: string,
): Promise<{ success: boolean; netAmount: number }> {
  const result = await settlementService.processSettlement(
    ownerId,
    period,
    false,
  );
  if (!result.success) {
    return { success: false, netAmount: 0 };
  }

  const calc = await settlementService.calculateSettlement(ownerId, period);
  return { success: true, netAmount: calc.netAmount };
}

async function processSingleOwnerSettlementDryRun(
  settlementService: any,
  ownerId: string,
  period: string,
) {
  const settlement = await settlementService.calculateSettlement(
    ownerId,
    period,
  );
  logger.info("Settlement calculated (dry run)", {
    ownerId,
    period,
    grossAmount: settlement.grossAmount,
    commissionAmount: settlement.commission.amount,
    netAmount: settlement.netAmount,
    scheduledDate: settlement.scheduledDate,
  });

  return {
    recordsTotal: 1,
    recordsProcessed: 0,
    recordsFailed: 0,
  };
}

async function processSingleOwnerSettlementLive(
  settlementService: any,
  ownerId: string,
  period: string,
) {
  const result = await settlementService.processSettlement(
    ownerId,
    period,
    false,
  );
  logger.info("Settlement processed", {
    ownerId,
    period,
    success: result.success,
    settlementId: result.settlementId,
    transferReference: result.transferReference,
  });

  return {
    recordsTotal: 1,
    recordsProcessed: result.success ? 1 : 0,
    recordsFailed: result.success ? 0 : 1,
  };
}

async function processAllOwnersSettlements(
  settlementService: any,
  period: string,
  dryRun: boolean,
) {
  const pending = await settlementService.getPendingSettlements();
  let total = 0;
  let successful = 0;
  let failedCount = 0;
  let totalNetAmount = 0;

  for (const { ownerId, period: settlementPeriod } of pending) {
    total++;
    const settlementResult = await processSettlementForOwner(
      settlementService,
      ownerId,
      settlementPeriod,
      dryRun,
    );

    if (!settlementResult.success) {
      failedCount++;
      continue;
    }

    successful++;
    totalNetAmount += settlementResult.netAmount;
  }

  logger.info("All settlements calculated", {
    period,
    total,
    successful,
    failed: failedCount,
    totalNetAmount,
    dryRun,
  });

  return {
    recordsTotal: total,
    recordsProcessed: successful,
    recordsFailed: failedCount,
  };
}

async function processSettlementForOwner(
  settlementService: any,
  ownerId: string,
  settlementPeriod: string,
  dryRun: boolean,
) {
  if (dryRun) {
    return calculateSettlementOnly(
      settlementService,
      ownerId,
      settlementPeriod,
    );
  }

  return processAndAccumulateSettlement(
    settlementService,
    ownerId,
    settlementPeriod,
  );
}

async function calculateSettlementOnly(
  settlementService: any,
  ownerId: string,
  period: string,
): Promise<{ success: boolean; netAmount: number }> {
  const calc = await settlementService.calculateSettlement(ownerId, period);
  return { success: true, netAmount: calc.netAmount };
}

program
  .name("billing-batch")
  .description("Batch billing system for rent management platform")
  .version("1.0.0");

/**
 * Billing command - Generate invoices for active leases.
 */
program
  .command("billing")
  .description("Generate invoices for active leases based on billing frequency")
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .option("-d, --dry-run", "Run without making changes", false)
  .option("--lease-id <id>", "Process specific lease only")
  .option("--date <date>", "Process for specific date (YYYY-MM-DD)")
  .action(async (options) => {
    const { BillingService } = await import("./services/billing.service");

    logger.info("Starting billing process", { options });
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      const billingDate = options.date ? new Date(options.date) : new Date();

      // Start job logging
      jobId = await billingJobService.startJob(
        "billing",
        { leaseId: options.leaseId, date: options.date },
        options.dryRun,
      );

      const billingService = new BillingService();
      const result = await billingService.runBilling(
        billingDate,
        options.dryRun,
      );

      logger.info("Billing process completed", {
        processedLeases: result.processedLeases,
        invoicesCreated: result.invoicesCreated,
        invoicesFailed: result.invoicesFailed,
        totalAmount: result.totalAmount,
      });

      // Complete job logging
      await billingJobService.completeJob(jobId, {
        recordsTotal: result.processedLeases,
        recordsProcessed: result.invoicesCreated,
        recordsFailed: result.invoicesFailed,
        errorLog: result.errors,
      });
      metricsSummary = {
        recordsTotal: result.processedLeases,
        recordsProcessed: result.invoicesCreated,
        recordsFailed: result.invoicesFailed,
      };

      if (result.errors.length > 0) {
        logger.warn("Some invoices failed", {
          errorCount: result.errors.length,
        });
      }

      await batchMetrics.recordJobRun({
        job: "billing",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Billing process failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "billing",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

/**
 * Overdue command - Mark overdue invoices.
 */
program
  .command("overdue")
  .description("Mark invoices as overdue based on due date")
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .option("-d, --dry-run", "Run without making changes", false)
  .action(async (options) => {
    const { BillingService } = await import("./services/billing.service");

    logger.info("Starting overdue process", { options });
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      // Start job logging
      jobId = await billingJobService.startJob("overdue", {}, options.dryRun);

      if (options.dryRun) {
        const { InvoiceService } = await import("./services/invoice.service");
        const invoiceService = new InvoiceService();
        const overdueInvoices = await invoiceService.findOverdue();
        logger.info("Dry run: would mark invoices as overdue", {
          count: overdueInvoices.length,
        });

        await billingJobService.completeJob(jobId, {
          recordsTotal: overdueInvoices.length,
          recordsProcessed: 0,
          recordsFailed: 0,
        });
        metricsSummary = {
          recordsTotal: overdueInvoices.length,
          recordsProcessed: 0,
          recordsFailed: 0,
        };
      } else {
        const billingService = new BillingService();
        const result = await billingService.processOverdue();
        logger.info("Overdue process completed", {
          markedOverdue: result.markedOverdue,
        });

        await billingJobService.completeJob(jobId, {
          recordsTotal: result.markedOverdue,
          recordsProcessed: result.markedOverdue,
          recordsFailed: 0,
        });
        metricsSummary = {
          recordsTotal: result.markedOverdue,
          recordsProcessed: result.markedOverdue,
          recordsFailed: 0,
        };
      }

      await batchMetrics.recordJobRun({
        job: "overdue",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Overdue process failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "overdue",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

/**
 * Reminders command - Send payment reminders via WhatsApp.
 */
program
  .command("reminders")
  .description("Send payment reminder WhatsApp messages for upcoming due dates")
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .option("-d, --dry-run", "Run without sending WhatsApp messages", false)
  .option("--days-before <days>", "Days before due date to send reminder", "3")
  .action(async (options) => {
    const { InvoiceService } = await import("./services/invoice.service");
    const { WhatsappService } = await import("./services/whatsapp.service");

    logger.info("Starting reminders process", { options });
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      const daysBefore = Number.parseInt(options.daysBefore, 10);

      // Start job logging
      jobId = await billingJobService.startJob(
        "reminders",
        { daysBefore },
        options.dryRun,
      );

      const invoiceService = new InvoiceService();
      const whatsappService = new WhatsappService();

      const reminderResult = await runReminders(
        invoiceService,
        whatsappService,
        daysBefore,
        options.dryRun,
      );

      logger.info("Reminders process completed", {
        total: reminderResult.total,
        sent: reminderResult.sent,
        failed: reminderResult.failed,
      });

      // Complete job logging
      await billingJobService.completeJob(jobId, {
        recordsTotal: reminderResult.total,
        recordsProcessed: reminderResult.sent,
        recordsFailed: reminderResult.failed,
      });
      metricsSummary = {
        recordsTotal: reminderResult.total,
        recordsProcessed: reminderResult.sent,
        recordsFailed: reminderResult.failed,
      };

      await batchMetrics.recordJobRun({
        job: "reminders",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Reminders process failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "reminders",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

/**
 * Sync-indices command - Synchronize inflation indices.
 */
program
  .command("sync-indices")
  .description("Fetch and store latest inflation indices (ICL, IPC)")
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .option("--index <type>", "Specific index to sync (icl, ipc)", "all")
  .action(async (options) => {
    const { IndicesSyncService } =
      await import("./services/indices-sync.service");

    logger.info("Starting sync-indices process", { options });
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      // Start job logging
      jobId = await billingJobService.startJob(
        "sync_indices",
        { index: options.index },
        false,
      );

      const syncService = new IndicesSyncService();
      const syncSummary = await runSyncIndices(syncService, options.index);

      // Complete job logging
      await billingJobService.completeJob(jobId, {
        recordsTotal: syncSummary.recordsTotal,
        recordsProcessed: syncSummary.recordsProcessed,
        recordsFailed: syncSummary.recordsFailed,
        errorLog: syncSummary.errorLog,
      });
      metricsSummary = {
        recordsTotal: syncSummary.recordsTotal,
        recordsProcessed: syncSummary.recordsProcessed,
        recordsFailed: syncSummary.recordsFailed,
      };

      logger.info("Sync-indices process completed");
      await batchMetrics.recordJobRun({
        job: "sync_indices",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Sync-indices process failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "sync_indices",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

/**
 * Sync-rates command - Synchronize exchange rates.
 */
program
  .command("sync-rates")
  .description(
    "Fetch and store latest exchange rates (USD/ARS, BRL/ARS, USD/BRL)",
  )
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .action(async () => {
    const { ExchangeRateService } =
      await import("./services/exchange-rate.service");

    logger.info("Starting sync-rates process");
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      // Start job logging
      jobId = await billingJobService.startJob("exchange_rates", {}, false);

      const exchangeService = new ExchangeRateService();
      const result = await exchangeService.syncRates();
      metricsSummary = {
        recordsTotal: result.processed,
        recordsProcessed: result.inserted,
        recordsFailed: result.errors.length,
      };

      await finalizeExchangeRatesJob(jobId, result);

      logger.info("Sync-rates process completed");
      await batchMetrics.recordJobRun({
        job: "exchange_rates",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Sync-rates process failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "exchange_rates",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

async function finalizeExchangeRatesJob(
  jobId: string,
  result: { processed: number; inserted: number; errors: string[] },
): Promise<void> {
  logger.info("Exchange rates sync completed", {
    processed: result.processed,
    inserted: result.inserted,
    errors: result.errors.length,
  });

  await billingJobService.completeJob(jobId, {
    recordsTotal: result.processed,
    recordsProcessed: result.inserted,
    recordsFailed: result.errors.length,
    errorLog: result.errors.map((errorMessage) => ({ error: errorMessage })),
  });

  if (result.errors.length === 0) {
    return;
  }

  logger.warn("Some exchange rate syncs failed", {
    errors: result.errors,
  });
}

/**
 * Reports command - Generate monthly reports.
 */
program
  .command("reports")
  .description("Generate monthly reports for property owners")
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .option("--type <type>", "Report type (monthly, settlement)", "monthly")
  .option("--owner-id <id>", "Generate for specific owner only")
  .option("--month <month>", "Report month (YYYY-MM)", "")
  .option("-d, --dry-run", "Generate without sending", false)
  .action(async (options) => {
    const { ReportService } = await import("./services/report.service");

    logger.info("Starting reports process", { options });
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      // Start job logging
      jobId = await billingJobService.startJob(
        "reports",
        { type: options.type, ownerId: options.ownerId, month: options.month },
        options.dryRun,
      );

      if (!options.ownerId) {
        logger.error("Owner ID required. Use --owner-id <id>");
        throw new Error("Owner ID required. Use --owner-id <id>");
      }

      const reportService = new ReportService();
      const now = new Date();
      const month =
        options.month ||
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [year, mon] = month.split("-").map(Number);

      const result =
        options.type === "settlement"
          ? await reportService.generateSettlement(options.ownerId, month)
          : await reportService.generateMonthlySummary(
              options.ownerId,
              year,
              mon,
            );

      if (result.success) {
        logger.info("Report generated", { pdfUrl: result.pdfUrl });
        await billingJobService.completeJob(jobId, {
          recordsTotal: 1,
          recordsProcessed: 1,
          recordsFailed: 0,
        });
        metricsSummary = {
          recordsTotal: 1,
          recordsProcessed: 1,
          recordsFailed: 0,
        };
      } else {
        logger.error("Report generation failed", { error: result.error });
        await billingJobService.completeJob(jobId, {
          recordsTotal: 1,
          recordsProcessed: 0,
          recordsFailed: 1,
          errorLog: [{ error: result.error }],
        });
        metricsSummary = {
          recordsTotal: 1,
          recordsProcessed: 0,
          recordsFailed: 1,
        };
      }

      logger.info("Reports process completed");
      await batchMetrics.recordJobRun({
        job: "reports",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Reports process failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "reports",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

/**
 * Process-settlements command - Calculate and process owner settlements.
 * T881: Settlement Service
 * T882: Settlement Command
 * T883: Settlement scheduled date logic (5th business day)
 */
program
  .command("process-settlements")
  .description("Calculate and process settlements for property owners")
  .option("--log <file>", "Write logs to the given file (no rotation)")
  .option("--period <period>", "Settlement period (YYYY-MM)", "")
  .option("--owner-id <id>", "Process for specific owner only")
  .option("-d, --dry-run", "Calculate without creating settlements", false)
  .option("--process", "Process pending settlements (mark as paid)", false)
  .action(async (options) => {
    const { SettlementService } = await import("./services/settlement.service");

    logger.info("Starting process-settlements", { options });
    const startedAtNs = process.hrtime.bigint();
    let jobId: string | undefined;
    let metricsSummary:
      | {
          recordsTotal: number;
          recordsProcessed: number;
          recordsFailed: number;
        }
      | undefined;
    try {
      await initializeDatabase();
      billingJobService = newBillingJobService();

      // Start job logging
      jobId = await billingJobService.startJob(
        "process_settlements",
        {
          period: options.period,
          ownerId: options.ownerId,
          process: options.process,
        },
        options.dryRun,
      );

      const settlementService = new SettlementService();
      const now = new Date();
      const period =
        options.period ||
        `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

      const summary = await resolveSettlementsSummary(
        settlementService,
        options,
        period,
      );
      metricsSummary = {
        recordsTotal: summary.recordsTotal,
        recordsProcessed: summary.recordsProcessed,
        recordsFailed: summary.recordsFailed,
      };

      await billingJobService.completeJob(jobId, summary);

      logger.info("Process-settlements completed");
      await batchMetrics.recordJobRun({
        job: "process_settlements",
        status: "success",
        startedAtNs,
        summary: metricsSummary,
      });
    } catch (error) {
      logger.error("Process-settlements failed", { error });
      if (jobId) {
        await billingJobService.failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      await batchMetrics.recordJobRun({
        job: "process_settlements",
        status: "failed",
        startedAtNs,
        summary: metricsSummary,
      });
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

async function resolveSettlementsSummary(
  settlementService: any,
  options: { process: boolean; ownerId?: string; dryRun: boolean },
  period: string,
) {
  if (options.process) {
    return processPendingSettlements(settlementService);
  }

  if (options.ownerId) {
    return options.dryRun
      ? processSingleOwnerSettlementDryRun(
          settlementService,
          options.ownerId,
          period,
        )
      : processSingleOwnerSettlementLive(
          settlementService,
          options.ownerId,
          period,
        );
  }

  return processAllOwnersSettlements(settlementService, period, options.dryRun);
}

async function main() {
  try {
    const mod = await import("./shared/logger");
    logger = mod.logger;

    const db = await import("./shared/database");
    initializeDatabase = db.initializeDatabase;
    closeDatabase = db.closeDatabase;

    const job = await import("./services/billing-job.service");
    BillingJobServiceCtor = job.BillingJobService;

    // Parse command line arguments
    program.parse(process.argv);

    // Show help if no command provided
    if (!process.argv.slice(2).length) {
      program.outputHelp();
    }
  } catch (err) {
    // If logger isn't available, fallback to console
    if (logger && typeof logger.error === "function") {
      logger.error("Fatal error starting batch", { error: err });
    } else {
      console.error("Fatal error starting batch", err);
    }
    process.exit(1);
  }
}

void main();
