import { AppDataSource } from '../shared/database';
import { logger } from '../shared/logger';
import {
    InvoiceService,
    CreateInvoiceData,
    InvoiceRecord,
    LeaseForBilling,
} from './invoice.service';
import { AdjustmentService, LeaseAdjustmentData } from './adjustment.service';
import { ExchangeRateService } from './exchange-rate.service';
import { WithholdingsService } from './withholdings.service';

/**
 * Result of a billing run.
 */
export interface BillingRunResult {
    processedLeases: number;
    invoicesCreated: number;
    invoicesFailed: number;
    errors: Array<{ leaseId: string; error: string }>;
    totalAmount: number;
}

/**
 * Result of overdue processing.
 */
export interface OverdueRunResult {
    processed: number;
    markedOverdue: number;
}

/**
 * Result of late fees processing.
 */
export interface LateFeesRunResult {
    processed: number;
    feesApplied: number;
    totalFees: number;
}

/**
 * Company withholding rates.
 */
interface CompanyWithholdings {
    isRetentionAgent: boolean;
    retentionIibbRate: number;
    retentionIvaRate: number;
    retentionGananciasRate: number;
}

/**
 * Service for orchestrating the billing process.
 * Generates invoices, handles overdue marking, and applies late fees.
 */
export class BillingService {
    private readonly invoiceService: InvoiceService;
    private readonly adjustmentService: AdjustmentService;
    private readonly exchangeRateService: ExchangeRateService;
    private readonly withholdingsService: WithholdingsService;

    /**
     * Default late fee rate (percentage).
     */
    private static readonly DEFAULT_LATE_FEE_RATE = 0.02; // 2%

    /**
     * Creates an instance of BillingService.
     */
    constructor(
        invoiceService?: InvoiceService,
        adjustmentService?: AdjustmentService,
        exchangeRateService?: ExchangeRateService,
        withholdingsService?: WithholdingsService
    ) {
        this.invoiceService = invoiceService || new InvoiceService();
        this.adjustmentService = adjustmentService || new AdjustmentService();
        this.exchangeRateService = exchangeRateService || new ExchangeRateService();
        this.withholdingsService = withholdingsService || new WithholdingsService();
    }

    /**
     * Runs the billing process for a specific date.
     * Identifies leases that need invoices and generates them.
     *
     * @param billingDate - Date to run billing for.
     * @param dryRun - If true, don't create actual invoices.
     * @returns Billing run result.
     */
    async runBilling(billingDate: Date, dryRun = false): Promise<BillingRunResult> {
        const result: BillingRunResult = {
            processedLeases: 0,
            invoicesCreated: 0,
            invoicesFailed: 0,
            errors: [],
            totalAmount: 0,
        };

        logger.info('Starting billing run', { billingDate, dryRun });

        // Get leases that need billing
        const leases = await this.invoiceService.getLeasesForBilling(billingDate);
        result.processedLeases = leases.length;

        logger.info('Found leases for billing', { count: leases.length });

        for (const lease of leases) {
            try {
                const invoice = await this.generateInvoiceForLease(
                    lease,
                    billingDate,
                    dryRun
                );

                if (invoice) {
                    result.invoicesCreated++;
                    result.totalAmount += invoice.total;
                }
            } catch (error) {
                result.invoicesFailed++;
                result.errors.push({
                    leaseId: lease.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                logger.error('Failed to generate invoice for lease', {
                    leaseId: lease.id,
                    error: error instanceof Error ? error.message : error,
                });
            }
        }

        logger.info('Billing run completed', result);
        return result;
    }

    /**
     * Generates an invoice for a single lease.
     */
    private async generateInvoiceForLease(
        lease: LeaseForBilling,
        billingDate: Date,
        dryRun: boolean
    ): Promise<InvoiceRecord | null> {
        // Calculate billing period
        const { periodStart, periodEnd, dueDate } = this.calculateBillingPeriod(
            lease,
            billingDate
        );

        // Get adjustment data
        const adjustmentData: LeaseAdjustmentData = {
            id: lease.id,
            rentAmount: lease.rentAmount,
            adjustmentType: (lease.adjustmentType as 'icl' | 'igpm' | 'fixed' | 'none') || 'none',
            adjustmentRate: lease.adjustmentRate,
            nextAdjustmentDate: lease.nextAdjustmentDate,
            lastAdjustmentDate: lease.lastAdjustmentDate,
            lastAdjustmentRate: lease.lastAdjustmentRate,
        };

        // Calculate adjusted rent
        const adjustment =
            await this.adjustmentService.calculateAdjustedRent(adjustmentData);

        let subtotal = adjustment.adjustedAmount;
        let exchangeRateUsed: number | undefined;
        let originalAmount: number | undefined;
        let originalCurrency: string | undefined;

        // Handle currency conversion if needed
        if (lease.currency && lease.currency !== 'ARS') {
            const conversion = await this.exchangeRateService.convertAmount(
                adjustment.adjustedAmount,
                lease.currency,
                'ARS',
                billingDate
            );
            originalAmount = adjustment.adjustedAmount;
            originalCurrency = lease.currency;
            exchangeRateUsed = conversion.rate;
            subtotal = conversion.amount;
        }

        // Calculate withholdings using dedicated service
        let withholdingIibb = 0;
        let withholdingIva = 0;
        let withholdingGanancias = 0;

        if (lease.companyId) {
            const withholdings = await this.withholdingsService.calculateWithholdings(
                lease.companyId,
                lease.ownerId,
                subtotal
            );
            withholdingIibb = withholdings.iibb;
            withholdingIva = withholdings.iva;
            withholdingGanancias = withholdings.ganancias;
        }

        const total = subtotal - withholdingIibb - withholdingIva - withholdingGanancias;

        if (dryRun) {
            logger.info('Dry run: would create invoice', {
                leaseId: lease.id,
                subtotal,
                total,
            });
            return null;
        }

        // Create the invoice
        const invoiceData: CreateInvoiceData = {
            leaseId: lease.id,
            ownerId: lease.ownerId,
            tenantAccountId: lease.tenantAccountId,
            periodStart,
            periodEnd,
            subtotal,
            total,
            currencyCode: 'ARS',
            dueDate,
            originalAmount,
            originalCurrency,
            exchangeRateUsed,
            exchangeRateDate: exchangeRateUsed ? billingDate : undefined,
            withholdingIibb,
            withholdingIva,
            withholdingGanancias,
            adjustmentApplied: adjustment.adjustedAmount - adjustment.originalAmount,
            adjustmentIndexType: adjustment.adjustmentType !== 'none' ? adjustment.adjustmentType : undefined,
            adjustmentIndexValue: adjustment.currentIndexValue,
        };

        const invoice = await this.invoiceService.create(invoiceData);

        // Update lease next billing date
        const nextBillingDate = this.calculateNextBillingDate(lease, billingDate);
        await this.invoiceService.updateLeaseNextBillingDate(
            lease.id,
            nextBillingDate,
            billingDate
        );

        return invoice;
    }

    /**
     * Calculates the billing period for a lease.
     */
    private calculateBillingPeriod(
        lease: LeaseForBilling,
        billingDate: Date
    ): { periodStart: Date; periodEnd: Date; dueDate: Date } {
        const periodStart = new Date(billingDate);
        periodStart.setDate(1);

        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        periodEnd.setDate(0);

        const dueDate = new Date(billingDate);
        dueDate.setDate(dueDate.getDate() + 10); // Default 10 days to pay

        return { periodStart, periodEnd, dueDate };
    }

    /**
     * Calculates the next billing date based on frequency.
     */
    private calculateNextBillingDate(
        lease: LeaseForBilling,
        currentBillingDate: Date
    ): Date {
        const next = new Date(currentBillingDate);

        switch (lease.paymentFrequency) {
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'biweekly':
                next.setDate(next.getDate() + 14);
                break;
            case 'monthly':
            default:
                next.setMonth(next.getMonth() + 1);
                break;
        }

        return next;
    }

    /**
     * Gets company withholding rates.
     */
    private async getCompanyWithholdings(
        companyId?: string
    ): Promise<CompanyWithholdings> {
        if (!companyId) {
            return {
                isRetentionAgent: false,
                retentionIibbRate: 0,
                retentionIvaRate: 0,
                retentionGananciasRate: 0,
            };
        }

        const result = await AppDataSource.query(
            `SELECT 
                is_retention_agent as "isRetentionAgent",
                retention_iibb_rate as "retentionIibbRate",
                retention_iva_rate as "retentionIvaRate",
                retention_ganancias_rate as "retentionGananciasRate"
             FROM companies 
             WHERE id = $1`,
            [companyId]
        );

        if (result.length === 0) {
            return {
                isRetentionAgent: false,
                retentionIibbRate: 0,
                retentionIvaRate: 0,
                retentionGananciasRate: 0,
            };
        }

        return {
            isRetentionAgent: result[0].isRetentionAgent || false,
            retentionIibbRate: Number.parseFloat(result[0].retentionIibbRate) || 0,
            retentionIvaRate: Number.parseFloat(result[0].retentionIvaRate) || 0,
            retentionGananciasRate: Number.parseFloat(result[0].retentionGananciasRate) || 0,
        };
    }

    /**
     * Processes overdue invoices - marks them as overdue.
     */
    async processOverdue(): Promise<OverdueRunResult> {
        logger.info('Starting overdue processing');

        const markedOverdue = await this.invoiceService.markOverdue();

        const result: OverdueRunResult = {
            processed: markedOverdue,
            markedOverdue,
        };

        logger.info('Overdue processing completed', result);
        return result;
    }

    /**
     * Applies late fees to overdue invoices.
     *
     * @param lateFeeRate - Late fee percentage (default 2%).
     */
    async processLateFees(
        lateFeeRate = BillingService.DEFAULT_LATE_FEE_RATE
    ): Promise<LateFeesRunResult> {
        logger.info('Starting late fees processing', { lateFeeRate });

        const result: LateFeesRunResult = {
            processed: 0,
            feesApplied: 0,
            totalFees: 0,
        };

        const overdueInvoices = await this.invoiceService.findOverdue();
        result.processed = overdueInvoices.length;

        for (const invoice of overdueInvoices) {
            // Only apply late fee if not already applied
            if (invoice.lateFee === 0) {
                const lateFee = invoice.subtotal * lateFeeRate;
                await this.invoiceService.applyLateFee(invoice.id, lateFee);
                result.feesApplied++;
                result.totalFees += lateFee;
            }
        }

        logger.info('Late fees processing completed', result);
        return result;
    }
}
