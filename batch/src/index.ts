#!/usr/bin/env node
import 'reflect-metadata';
import { config } from 'dotenv';
import { Command } from 'commander';
import { logger } from './shared/logger';
import { initializeDatabase, closeDatabase } from './shared/database';

// Load environment variables
config();

const program = new Command();

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
    .option('-d, --dry-run', 'Run without making changes', false)
    .option('--lease-id <id>', 'Process specific lease only')
    .option('--date <date>', 'Process for specific date (YYYY-MM-DD)')
    .action(async (options) => {
        const { BillingService } = await import('./services/billing.service');

        logger.info('Starting billing process', { options });
        try {
            await initializeDatabase();

            const billingDate = options.date
                ? new Date(options.date)
                : new Date();

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

            if (result.errors.length > 0) {
                logger.warn('Some invoices failed', {
                    errorCount: result.errors.length,
                });
            }
        } catch (error) {
            logger.error('Billing process failed', { error });
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
    .option('-d, --dry-run', 'Run without making changes', false)
    .action(async (options) => {
        const { BillingService } = await import('./services/billing.service');

        logger.info('Starting overdue process', { options });
        try {
            await initializeDatabase();

            if (options.dryRun) {
                const { InvoiceService } = await import('./services/invoice.service');
                const invoiceService = new InvoiceService();
                const overdueInvoices = await invoiceService.findOverdue();
                logger.info('Dry run: would mark invoices as overdue', {
                    count: overdueInvoices.length,
                });
            } else {
                const billingService = new BillingService();
                const result = await billingService.processOverdue();
                logger.info('Overdue process completed', {
                    markedOverdue: result.markedOverdue,
                });
            }
        } catch (error) {
            logger.error('Overdue process failed', { error });
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
    .option('-d, --dry-run', 'Run without sending emails', false)
    .option('--days-before <days>', 'Days before due date to send reminder', '3')
    .action(async (options) => {
        const { InvoiceService } = await import('./services/invoice.service');
        const { EmailService } = await import('./services/email.service');

        logger.info('Starting reminders process', { options });
        try {
            await initializeDatabase();

            const daysBefore = Number.parseInt(options.daysBefore, 10);
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
        } catch (error) {
            logger.error('Reminders process failed', { error });
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
    .option('-d, --dry-run', 'Run without making changes', false)
    .option('--rate <rate>', 'Late fee rate percentage', '2')
    .action(async (options) => {
        const { BillingService } = await import('./services/billing.service');

        logger.info('Starting late-fees process', { options });
        try {
            await initializeDatabase();

            const rate = Number.parseFloat(options.rate) / 100;

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
            } else {
                const billingService = new BillingService();
                const result = await billingService.processLateFees(rate);
                logger.info('Late-fees process completed', {
                    feesApplied: result.feesApplied,
                    totalFees: result.totalFees,
                });
            }
        } catch (error) {
            logger.error('Late-fees process failed', { error });
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
    .option('--index <type>', 'Specific index to sync (icl, igpm)', 'all')
    .action(async (options) => {
        const { IndicesSyncService } = await import('./services/indices-sync.service');

        logger.info('Starting sync-indices process', { options });
        try {
            await initializeDatabase();

            const syncService = new IndicesSyncService();

            if (options.index === 'all') {
                const results = await syncService.syncAll();
                for (const result of results) {
                    if (result.error) {
                        logger.error(`${result.indexType.toUpperCase()} sync failed`, { error: result.error });
                    } else {
                        logger.info(`${result.indexType.toUpperCase()} sync completed`, {
                            processed: result.recordsProcessed,
                            inserted: result.recordsInserted,
                            skipped: result.recordsSkipped,
                            latestPeriod: result.latestPeriod,
                        });
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
            } else if (options.index === 'igpm') {
                const result = await syncService.syncIgpm();
                logger.info('IGP-M sync completed', {
                    processed: result.recordsProcessed,
                    inserted: result.recordsInserted,
                    skipped: result.recordsSkipped,
                    latestPeriod: result.latestPeriod,
                });
            } else {
                logger.error('Invalid index type', { index: options.index });
                process.exit(1);
            }

            logger.info('Sync-indices process completed');
        } catch (error) {
            logger.error('Sync-indices process failed', { error });
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
    .action(async () => {
        const { ExchangeRateService } = await import('./services/exchange-rate.service');

        logger.info('Starting sync-rates process');
        try {
            await initializeDatabase();

            const exchangeService = new ExchangeRateService();
            const result = await exchangeService.syncRates();

            logger.info('Exchange rates sync completed', {
                processed: result.processed,
                inserted: result.inserted,
                errors: result.errors.length,
            });

            if (result.errors.length > 0) {
                logger.warn('Some exchange rate syncs failed', { errors: result.errors });
            }

            logger.info('Sync-rates process completed');
        } catch (error) {
            logger.error('Sync-rates process failed', { error });
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
    .option('--type <type>', 'Report type (monthly, settlement)', 'monthly')
    .option('--owner-id <id>', 'Generate for specific owner only')
    .option('--month <month>', 'Report month (YYYY-MM)', '')
    .option('-d, --dry-run', 'Generate without sending', false)
    .action(async (options) => {
        const { ReportService } = await import('./services/report.service');

        logger.info('Starting reports process', { options });
        try {
            await initializeDatabase();

            const reportService = new ReportService();
            const now = new Date();
            const month = options.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const [year, mon] = month.split('-').map(Number);

            if (!options.ownerId) {
                logger.error('Owner ID required. Use --owner-id <id>');
                process.exit(1);
            }

            let result;
            if (options.type === 'settlement') {
                result = await reportService.generateSettlement(options.ownerId, month);
            } else {
                result = await reportService.generateMonthlySummary(options.ownerId, year, mon);
            }

            if (result.success) {
                logger.info('Report generated', { pdfPath: result.pdfPath });
            } else {
                logger.error('Report generation failed', { error: result.error });
            }

            logger.info('Reports process completed');
        } catch (error) {
            logger.error('Reports process failed', { error });
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
    .option('--period <period>', 'Settlement period (YYYY-MM)', '')
    .option('--owner-id <id>', 'Process for specific owner only')
    .option('-d, --dry-run', 'Calculate without creating settlements', false)
    .option('--process', 'Process pending settlements (mark as paid)', false)
    .action(async (options) => {
        const { SettlementService } = await import('./services/settlement.service');

        logger.info('Starting process-settlements', { options });
        try {
            await initializeDatabase();

            const settlementService = new SettlementService();
            const now = new Date();
            const period = options.period || `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

            if (options.process) {
                // Process pending settlements
                const result = await settlementService.processPendingSettlements();
                logger.info('Settlements processed', {
                    processed: result.processed,
                    failed: result.failed,
                    totalAmount: result.totalAmount,
                });
            } else if (options.ownerId) {
                // Calculate for specific owner
                const settlement = await settlementService.calculateSettlement(
                    options.ownerId,
                    period,
                    options.dryRun
                );
                logger.info('Settlement calculated', {
                    ownerId: options.ownerId,
                    period,
                    grossAmount: settlement.grossAmount,
                    commissionAmount: settlement.commissionAmount,
                    netAmount: settlement.netAmount,
                    scheduledDate: settlement.scheduledDate,
                    dryRun: options.dryRun,
                });
            } else {
                // Calculate for all owners
                const result = await settlementService.calculateAllSettlements(
                    period,
                    options.dryRun
                );
                logger.info('All settlements calculated', {
                    period,
                    total: result.total,
                    successful: result.successful,
                    failed: result.failed,
                    totalNetAmount: result.totalNetAmount,
                    dryRun: options.dryRun,
                });
            }

            logger.info('Process-settlements completed');
        } catch (error) {
            logger.error('Process-settlements failed', { error });
            process.exit(1);
        } finally {
            await closeDatabase();
        }
    });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
