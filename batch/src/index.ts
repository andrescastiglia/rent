#!/usr/bin/env node
import 'reflect-metadata';
import { config } from 'dotenv';
import { Command } from 'commander';
import type { BillingJobService } from './services/billing-job.service';

// Load environment variables
config();

// Early CLI parsing for `--log <file>` so logger can pick it up on import.
// Supports `--log=/path/to/file.log` or `--log /path/to/file.log`.
const rawArgs = process.argv.slice(2);
for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a.startsWith('--log=')) {
        process.env.LOG_FILE = a.split('=')[1];
        break;
    }
    if (a === '--log' && i + 1 < rawArgs.length) {
        process.env.LOG_FILE = rawArgs[i + 1];
        break;
    }
}

// Singleton instance for job logging
let billingJobService: BillingJobService;

let BillingJobServiceCtor: (new () => BillingJobService) | undefined;

function newBillingJobService(): BillingJobService {
    if (!BillingJobServiceCtor) {
        throw new Error('BillingJobService not loaded');
    }
    return new BillingJobServiceCtor();
}

let initializeDatabase: () => Promise<unknown> = async () => {
    throw new Error('Database module not loaded');
};
let closeDatabase: () => Promise<void> = async () => {
    // no-op until loaded
};

const program = new Command();

// Import logger after potential `process.env.LOG_FILE` is set.
// Use dynamic import inside main() so ESLint does not complain about require().
let logger: any;

program
    .name('billing-batch')
    .description('Batch billing system for rent management platform')
    .version('1.0.0');

/**
 * Billing command - Generate invoices for active leases.
 */
program
    .command('billing')
    .description('Generate invoices for active leases based on billing frequency')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('-d, --dry-run', 'Run without making changes', false)
    .option('--lease-id <id>', 'Process specific lease only')
    .option('--date <date>', 'Process for specific date (YYYY-MM-DD)')
    .action(async (options) => {
        const { BillingService } = await import('./services/billing.service');

        logger.info('Starting billing process', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            const billingDate = options.date
                ? new Date(options.date)
                : new Date();

            // Start job logging
            jobId = await billingJobService.startJob(
                'billing',
                { leaseId: options.leaseId, date: options.date },
                options.dryRun
            );

            const billingService = new BillingService();
            const result = await billingService.runBilling(
                billingDate,
                options.dryRun
            );

            logger.info('Billing process completed', {
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

            if (result.errors.length > 0) {
                logger.warn('Some invoices failed', {
                    errorCount: result.errors.length,
                });
            }
        } catch (error) {
            logger.error('Billing process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

/**
 * Overdue command - Mark overdue invoices.
 */
program
    .command('overdue')
    .description('Mark invoices as overdue based on due date')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('-d, --dry-run', 'Run without making changes', false)
    .action(async (options) => {
        const { BillingService } = await import('./services/billing.service');

        logger.info('Starting overdue process', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            // Start job logging
            jobId = await billingJobService.startJob('overdue', {}, options.dryRun);

            if (options.dryRun) {
                const { InvoiceService } = await import('./services/invoice.service');
                const invoiceService = new InvoiceService();
                const overdueInvoices = await invoiceService.findOverdue();
                logger.info('Dry run: would mark invoices as overdue', {
                    count: overdueInvoices.length,
                });

                await billingJobService.completeJob(jobId, {
                    recordsTotal: overdueInvoices.length,
                    recordsProcessed: 0,
                    recordsFailed: 0,
                });
            } else {
                const billingService = new BillingService();
                const result = await billingService.processOverdue();
                logger.info('Overdue process completed', {
                    markedOverdue: result.markedOverdue,
                });

                await billingJobService.completeJob(jobId, {
                    recordsTotal: result.markedOverdue,
                    recordsProcessed: result.markedOverdue,
                    recordsFailed: 0,
                });
            }
        } catch (error) {
            logger.error('Overdue process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

/**
 * Reminders command - Send payment reminders.
 */
program
    .command('reminders')
    .description('Send payment reminder emails for upcoming due dates')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('-d, --dry-run', 'Run without sending emails', false)
    .option('--days-before <days>', 'Days before due date to send reminder', '3')
    .action(async (options) => {
        const { InvoiceService } = await import('./services/invoice.service');
        const { EmailService } = await import('./services/email.service');

        logger.info('Starting reminders process', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            const daysBefore = Number.parseInt(options.daysBefore, 10);

            // Start job logging
            jobId = await billingJobService.startJob(
                'reminders',
                { daysBefore },
                options.dryRun
            );

            const invoiceService = new InvoiceService();
            const emailService = new EmailService();

            const pendingInvoices = await invoiceService.findPendingDueSoon(daysBefore);
            let sent = 0;
            let failed = 0;

            for (const invoice of pendingInvoices) {
                const daysUntilDue = Math.ceil(
                    (new Date(invoice.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );

                if (options.dryRun) {
                    logger.info('Dry run: would send reminder', {
                        invoiceNumber: invoice.invoiceNumber,
                        daysUntilDue,
                    });
                    sent++;
                } else {
                    const result = await emailService.sendPaymentReminder({
                        invoice,
                        tenant: { email: 'tenant@example.com' }, // TODO: get from DB
                        daysUntilDue,
                    });
                    if (result.success) {
                        sent++;
                    } else {
                        failed++;
                    }
                }
            }

            logger.info('Reminders process completed', {
                total: pendingInvoices.length,
                sent,
                failed,
            });

            // Complete job logging
            await billingJobService.completeJob(jobId, {
                recordsTotal: pendingInvoices.length,
                recordsProcessed: sent,
                recordsFailed: failed,
            });
        } catch (error) {
            logger.error('Reminders process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

/**
 * Late-fees command - Apply late fees to overdue invoices.
 */
program
    .command('late-fees')
    .description('Calculate and apply late fees to overdue invoices')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('-d, --dry-run', 'Run without making changes', false)
    .option('--rate <rate>', 'Late fee rate percentage', '2')
    .action(async (options) => {
        const { BillingService } = await import('./services/billing.service');

        logger.info('Starting late-fees process', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            const rate = Number.parseFloat(options.rate) / 100;

            // Start job logging
            jobId = await billingJobService.startJob(
                'late_fees',
                { rate: options.rate },
                options.dryRun
            );

            if (options.dryRun) {
                const { InvoiceService } = await import('./services/invoice.service');
                const invoiceService = new InvoiceService();
                const overdueInvoices = await invoiceService.findOverdue();
                const potentialFees = overdueInvoices
                    .filter((i) => i.lateFee === 0)
                    .reduce((sum, i) => sum + i.subtotal * rate, 0);
                logger.info('Dry run: would apply late fees', {
                    invoicesCount: overdueInvoices.length,
                    potentialFees,
                });

                await billingJobService.completeJob(jobId, {
                    recordsTotal: overdueInvoices.length,
                    recordsProcessed: 0,
                    recordsFailed: 0,
                });
            } else {
                const billingService = new BillingService();
                const result = await billingService.processLateFees(rate);
                logger.info('Late-fees process completed', {
                    feesApplied: result.feesApplied,
                    totalFees: result.totalFees,
                });

                await billingJobService.completeJob(jobId, {
                    recordsTotal: result.feesApplied,
                    recordsProcessed: result.feesApplied,
                    recordsFailed: 0,
                });
            }
        } catch (error) {
            logger.error('Late-fees process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

/**
 * Sync-indices command - Synchronize inflation indices.
 */
program
    .command('sync-indices')
    .description('Fetch and store latest inflation indices (ICL, IGP-M)')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('--index <type>', 'Specific index to sync (icl, igpm)', 'all')
    .action(async (options) => {
        const { IndicesSyncService } = await import('./services/indices-sync.service');

        logger.info('Starting sync-indices process', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            // Start job logging
            jobId = await billingJobService.startJob(
                'sync_indices',
                { index: options.index },
                false
            );

            const syncService = new IndicesSyncService();
            let totalProcessed = 0;
            let totalInserted = 0;
            let totalErrors = 0;
            const errorLog: object[] = [];

            if (options.index === 'all') {
                const results = await syncService.syncAll();
                for (const result of results) {
                    if (result.error) {
                        logger.error(`${result.indexType.toUpperCase()} sync failed`, { error: result.error });
                        totalErrors++;
                        errorLog.push({ indexType: result.indexType, error: result.error });
                    } else {
                        logger.info(`${result.indexType.toUpperCase()} sync completed`, {
                            processed: result.recordsProcessed,
                            inserted: result.recordsInserted,
                            skipped: result.recordsSkipped,
                            latestPeriod: result.latestPeriod,
                        });
                        totalProcessed += result.recordsProcessed || 0;
                        totalInserted += result.recordsInserted || 0;
                    }
                }
            } else if (options.index === 'icl') {
                const result = await syncService.syncIcl();
                logger.info('ICL sync completed', {
                    processed: result.recordsProcessed,
                    inserted: result.recordsInserted,
                    skipped: result.recordsSkipped,
                    latestPeriod: result.latestPeriod,
                });
                totalProcessed = result.recordsProcessed || 0;
                totalInserted = result.recordsInserted || 0;
            } else if (options.index === 'igpm') {
                const result = await syncService.syncIgpm();
                logger.info('IGP-M sync completed', {
                    processed: result.recordsProcessed,
                    inserted: result.recordsInserted,
                    skipped: result.recordsSkipped,
                    latestPeriod: result.latestPeriod,
                });
                totalProcessed = result.recordsProcessed || 0;
                totalInserted = result.recordsInserted || 0;
            } else {
                logger.error('Invalid index type', { index: options.index });
                await billingJobService.failJob(jobId, `Invalid index type: ${options.index}`);
                process.exit(1);
            }

            // Complete job logging
            await billingJobService.completeJob(jobId, {
                recordsTotal: totalProcessed,
                recordsProcessed: totalInserted,
                recordsFailed: totalErrors,
                errorLog,
            });

            logger.info('Sync-indices process completed');
        } catch (error) {
            logger.error('Sync-indices process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

/**
 * Sync-rates command - Synchronize exchange rates.
 */
program
    .command('sync-rates')
    .description('Fetch and store latest exchange rates (USD/ARS, BRL/ARS, USD/BRL)')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .action(async () => {
        const { ExchangeRateService } = await import('./services/exchange-rate.service');

        logger.info('Starting sync-rates process');
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            // Start job logging
            jobId = await billingJobService.startJob('exchange_rates', {}, false);

            const exchangeService = new ExchangeRateService();
            const result = await exchangeService.syncRates();

            logger.info('Exchange rates sync completed', {
                processed: result.processed,
                inserted: result.inserted,
                errors: result.errors.length,
            });

            // Complete job logging
            await billingJobService.completeJob(jobId, {
                recordsTotal: result.processed,
                recordsProcessed: result.inserted,
                recordsFailed: result.errors.length,
                errorLog: result.errors.map((e) => ({ error: e })),
            });

            if (result.errors.length > 0) {
                logger.warn('Some exchange rate syncs failed', { errors: result.errors });
            }

            logger.info('Sync-rates process completed');
        } catch (error) {
            logger.error('Sync-rates process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

/**
 * Reports command - Generate monthly reports.
 */
program
    .command('reports')
    .description('Generate and send monthly reports to property owners')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('--type <type>', 'Report type (monthly, settlement)', 'monthly')
    .option('--owner-id <id>', 'Generate for specific owner only')
    .option('--month <month>', 'Report month (YYYY-MM)', '')
    .option('-d, --dry-run', 'Generate without sending', false)
    .action(async (options) => {
        const { ReportService } = await import('./services/report.service');

        logger.info('Starting reports process', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            // Start job logging
            jobId = await billingJobService.startJob(
                'reports',
                { type: options.type, ownerId: options.ownerId, month: options.month },
                options.dryRun
            );

            if (!options.ownerId) {
                logger.error('Owner ID required. Use --owner-id <id>');
                process.exit(1);
            }

            const reportService = new ReportService();
            const now = new Date();
            const month =
                options.month ||
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const [year, mon] = month.split('-').map(Number);

            const result =
                options.type === 'settlement'
                    ? await reportService.generateSettlement(options.ownerId, month)
                    : await reportService.generateMonthlySummary(options.ownerId, year, mon);

            if (result.success) {
                logger.info('Report generated', { pdfPath: result.pdfPath });
                await billingJobService.completeJob(jobId, {
                    recordsTotal: 1,
                    recordsProcessed: 1,
                    recordsFailed: 0,
                });
            } else {
                logger.error('Report generation failed', { error: result.error });
                await billingJobService.completeJob(jobId, {
                    recordsTotal: 1,
                    recordsProcessed: 0,
                    recordsFailed: 1,
                    errorLog: [{ error: result.error }],
                });
            }

            logger.info('Reports process completed');
        } catch (error) {
            logger.error('Reports process failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
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
    .command('process-settlements')
    .description('Calculate and process settlements for property owners')
    .option('--log <file>', 'Write logs to the given file (no rotation)')
    .option('--period <period>', 'Settlement period (YYYY-MM)', '')
    .option('--owner-id <id>', 'Process for specific owner only')
    .option('-d, --dry-run', 'Calculate without creating settlements', false)
    .option('--process', 'Process pending settlements (mark as paid)', false)
    .action(async (options) => {
        const { SettlementService } = await import('./services/settlement.service');

        logger.info('Starting process-settlements', { options });
        let jobId: string | undefined;
        try {
            await initializeDatabase();
            billingJobService = newBillingJobService();

            // Start job logging
            jobId = await billingJobService.startJob(
                'process_settlements',
                { period: options.period, ownerId: options.ownerId, process: options.process },
                options.dryRun
            );

            const settlementService = new SettlementService();
            const now = new Date();
            const period = options.period || `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

            if (options.process) {
                // Process pending settlements
                const pending = await settlementService.getPendingSettlements();
                let processed = 0;
                let failed = 0;
                let totalAmount = 0;

                for (const { ownerId, period: settlementPeriod } of pending) {
                    const result = await settlementService.processSettlement(ownerId, settlementPeriod, false);
                    if (result.success) {
                        processed++;
                        // Get the calculation to sum up amounts
                        const calc = await settlementService.calculateSettlement(ownerId, settlementPeriod);
                        totalAmount += calc.netAmount;
                    } else {
                        failed++;
                    }
                }

                logger.info('Settlements processed', {
                    processed,
                    failed,
                    totalAmount,
                });

                await billingJobService.completeJob(jobId, {
                    recordsTotal: pending.length,
                    recordsProcessed: processed,
                    recordsFailed: failed,
                });
            } else if (options.ownerId) {
                // Calculate for specific owner
                if (options.dryRun) {
                    const settlement = await settlementService.calculateSettlement(
                        options.ownerId,
                        period
                    );
                    logger.info('Settlement calculated (dry run)', {
                        ownerId: options.ownerId,
                        period,
                        grossAmount: settlement.grossAmount,
                        commissionAmount: settlement.commission.amount,
                        netAmount: settlement.netAmount,
                        scheduledDate: settlement.scheduledDate,
                    });

                    await billingJobService.completeJob(jobId, {
                        recordsTotal: 1,
                        recordsProcessed: 0,
                        recordsFailed: 0,
                    });
                } else {
                    const result = await settlementService.processSettlement(
                        options.ownerId,
                        period,
                        false
                    );
                    logger.info('Settlement processed', {
                        ownerId: options.ownerId,
                        period,
                        success: result.success,
                        settlementId: result.settlementId,
                        transferReference: result.transferReference,
                    });

                    await billingJobService.completeJob(jobId, {
                        recordsTotal: 1,
                        recordsProcessed: result.success ? 1 : 0,
                        recordsFailed: result.success ? 0 : 1,
                    });
                }
            } else {
                // Calculate for all owners
                const pending = await settlementService.getPendingSettlements();
                let total = 0;
                let successful = 0;
                let failedCount = 0;
                let totalNetAmount = 0;

                for (const { ownerId, period: settlementPeriod } of pending) {
                    total++;
                    if (options.dryRun) {
                        const calc = await settlementService.calculateSettlement(ownerId, settlementPeriod);
                        totalNetAmount += calc.netAmount;
                        successful++;
                    } else {
                        const result = await settlementService.processSettlement(ownerId, settlementPeriod, false);
                        if (result.success) {
                            const calc = await settlementService.calculateSettlement(ownerId, settlementPeriod);
                            totalNetAmount += calc.netAmount;
                            successful++;
                        } else {
                            failedCount++;
                        }
                    }
                }

                logger.info('All settlements calculated', {
                    period,
                    total,
                    successful,
                    failed: failedCount,
                    totalNetAmount,
                    dryRun: options.dryRun,
                });

                await billingJobService.completeJob(jobId, {
                    recordsTotal: total,
                    recordsProcessed: successful,
                    recordsFailed: failedCount,
                });
            }

            logger.info('Process-settlements completed');
        } catch (error) {
            logger.error('Process-settlements failed', { error });
            if (jobId) {
                await billingJobService.failJob(
                    jobId,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

async function main() {
    const mod = await import('./shared/logger');
    logger = mod.logger;

    const db = await import('./shared/database');
    initializeDatabase = db.initializeDatabase;
    closeDatabase = db.closeDatabase;

    const job = await import('./services/billing-job.service');
    BillingJobServiceCtor = job.BillingJobService;

    // Parse command line arguments
    program.parse(process.argv);

    // Show help if no command provided
    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

main().catch((err) => {
    // If logger isn't available, fallback to console
    if (logger && typeof logger.error === 'function') {
        logger.error('Fatal error starting batch', { error: err });
    } else {
        // eslint-disable-next-line no-console
        console.error('Fatal error starting batch', err);
    }
    process.exit(1);
});
