import { AppDataSource } from '../shared/database';
import { logger } from '../shared/logger';

/**
 * Status of an invoice.
 */
export type InvoiceStatus =
    | 'draft'
    | 'issued'
    | 'paid'
    | 'partially_paid'
    | 'cancelled'
    | 'overdue';

/**
 * Data required to create a new invoice.
 */
export interface CreateInvoiceData {
    leaseId: string;
    ownerId: string;
    tenantAccountId: string;
    periodStart: Date;
    periodEnd: Date;
    subtotal: number;
    total: number;
    currencyCode?: string;
    dueDate: Date;
    // Multi-currency
    originalAmount?: number;
    originalCurrency?: string;
    exchangeRateUsed?: number;
    exchangeRateDate?: Date;
    // Withholdings
    withholdingIibb?: number;
    withholdingIva?: number;
    withholdingGanancias?: number;
    // Adjustment tracking
    adjustmentApplied?: number;
    adjustmentIndexType?: string;
    adjustmentIndexValue?: number;
}

/**
 * Invoice record from database.
 */
export interface InvoiceRecord {
    id: string;
    leaseId: string;
    ownerId: string;
    tenantAccountId: string;
    invoiceNumber: string;
    periodStart: Date;
    periodEnd: Date;
    subtotal: number;
    lateFee: number;
    adjustments: number;
    total: number;
    currencyCode: string;
    amountPaid: number;
    dueDate: Date;
    status: InvoiceStatus;
    issuedAt?: Date;
    originalAmount?: number;
    originalCurrency?: string;
    exchangeRateUsed?: number;
    withholdingIibb: number;
    withholdingIva: number;
    withholdingGanancias: number;
    withholdingsTotal: number;
    createdAt: Date;
}

/**
 * Lease data needed for billing.
 */
export interface LeaseForBilling {
    id: string;
    unitId: string;
    tenantId: string;
    ownerId: string;
    tenantAccountId: string;
    rentAmount: number;
    currency: string;
    paymentFrequency: 'monthly' | 'biweekly' | 'weekly';
    status: string;
    startDate: Date;
    endDate: Date;
    // Adjustment fields
    adjustmentType?: string;
    adjustmentRate?: number;
    inflationIndexType?: string;
    nextAdjustmentDate?: Date;
    lastAdjustmentDate?: Date;
    // Billing fields
    billingDay?: number;
    nextBillingDate?: Date;
    lastBillingDate?: Date;
    // Company info for withholdings
    companyId?: string;
}

/**
 * Service for managing invoices in the batch system.
 */
export class InvoiceService {
    /**
     * Generates the next invoice number for an owner.
     */
    private async generateInvoiceNumber(ownerId: string): Promise<string> {
        const year = new Date().getFullYear();
        const result = await AppDataSource.query(
            `SELECT COUNT(*) as count 
             FROM invoices 
             WHERE owner_id = $1 
               AND EXTRACT(YEAR FROM created_at) = $2`,
            [ownerId, year]
        );

        const count = Number.parseInt(result[0].count, 10) + 1;
        return `${year}-${count.toString().padStart(6, '0')}`;
    }

    /**
     * Creates a new invoice in the database.
     *
     * @param data - Invoice data.
     * @returns Created invoice record.
     */
    async create(data: CreateInvoiceData): Promise<InvoiceRecord> {
        const invoiceNumber = await this.generateInvoiceNumber(data.ownerId);

        const withholdingsTotal =
            (data.withholdingIibb || 0) +
            (data.withholdingIva || 0) +
            (data.withholdingGanancias || 0);

        try {
            const result = await AppDataSource.query(
                `INSERT INTO invoices (
                    lease_id, owner_id, tenant_account_id,
                    invoice_number, period_start, period_end,
                    subtotal, total, currency_code, due_date,
                    status, issued_at,
                    original_amount, original_currency, exchange_rate_used, exchange_rate_date,
                    withholding_iibb, withholding_iva, withholding_ganancias, withholdings_total,
                    adjustment_applied, adjustment_index_type, adjustment_index_value
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    'issued', NOW(),
                    $11, $12, $13, $14,
                    $15, $16, $17, $18,
                    $19, $20, $21
                ) RETURNING *`,
                [
                    data.leaseId,
                    data.ownerId,
                    data.tenantAccountId,
                    invoiceNumber,
                    data.periodStart,
                    data.periodEnd,
                    data.subtotal,
                    data.total,
                    data.currencyCode || 'ARS',
                    data.dueDate,
                    data.originalAmount,
                    data.originalCurrency,
                    data.exchangeRateUsed,
                    data.exchangeRateDate,
                    data.withholdingIibb || 0,
                    data.withholdingIva || 0,
                    data.withholdingGanancias || 0,
                    withholdingsTotal,
                    data.adjustmentApplied || 0,
                    data.adjustmentIndexType,
                    data.adjustmentIndexValue,
                ]
            );

            logger.info('Invoice created', {
                invoiceNumber,
                leaseId: data.leaseId,
                total: data.total,
            });

            return this.mapToRecord(result[0]);
        } catch (error) {
            logger.error('Failed to create invoice', {
                leaseId: data.leaseId,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Finds pending invoices that are due within X days.
     */
    async findPendingDueSoon(daysBefore: number): Promise<InvoiceRecord[]> {
        const result = await AppDataSource.query(
            `SELECT * FROM invoices 
             WHERE status IN ('issued', 'partially_paid')
               AND deleted_at IS NULL
               AND due_date <= CURRENT_DATE + $1::interval
               AND due_date >= CURRENT_DATE
             ORDER BY due_date ASC`,
            [`${daysBefore} days`]
        );

        return result.map(this.mapToRecord);
    }

    /**
     * Finds invoices that are overdue (past due date).
     */
    async findOverdue(): Promise<InvoiceRecord[]> {
        const result = await AppDataSource.query(
            `SELECT * FROM invoices 
             WHERE status IN ('issued', 'partially_paid')
               AND deleted_at IS NULL
               AND due_date < CURRENT_DATE
             ORDER BY due_date ASC`
        );

        return result.map(this.mapToRecord);
    }

    /**
     * Marks invoices as overdue.
     *
     * @returns Number of invoices marked as overdue.
     */
    async markOverdue(): Promise<number> {
        const result = await AppDataSource.query(
            `UPDATE invoices 
             SET status = 'overdue', updated_at = NOW()
             WHERE status IN ('issued', 'partially_paid')
               AND deleted_at IS NULL
               AND due_date < CURRENT_DATE
             RETURNING id`
        );

        const count = result.length;
        if (count > 0) {
            logger.info('Marked invoices as overdue', { count });
        }

        return count;
    }

    /**
     * Applies late fee to an overdue invoice.
     *
     * @param invoiceId - Invoice ID.
     * @param lateFee - Late fee amount.
     * @returns Updated invoice.
     */
    async applyLateFee(invoiceId: string, lateFee: number): Promise<InvoiceRecord> {
        const result = await AppDataSource.query(
            `UPDATE invoices 
             SET late_fee = late_fee + $2,
                 total = total + $2,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [invoiceId, lateFee]
        );

        if (result.length === 0) {
            throw new Error(`Invoice not found: ${invoiceId}`);
        }

        logger.info('Late fee applied', { invoiceId, lateFee });

        return this.mapToRecord(result[0]);
    }

    /**
     * Gets leases that need billing today.
     *
     * @param billingDate - Date to check for billing.
     * @returns Leases that need invoices generated.
     */
    async getLeasesForBilling(billingDate: Date): Promise<LeaseForBilling[]> {
        const dayOfMonth = billingDate.getDate();

        const result = await AppDataSource.query(
            `SELECT 
                l.id,
                l.unit_id as "unitId",
                l.tenant_id as "tenantId",
                l.owner_id as "ownerId",
                ta.id as "tenantAccountId",
                l.monthly_rent as "rentAmount",
                l.currency,
                l.payment_frequency as "paymentFrequency",
                l.status,
                l.start_date as "startDate",
                l.end_date as "endDate",
                l.adjustment_type as "adjustmentType",
                l.adjustment_value as "adjustmentRate",
                l.inflation_index_type as "inflationIndexType",
                l.next_adjustment_date as "nextAdjustmentDate",
                l.last_adjustment_date as "lastAdjustmentDate",
                l.billing_day as "billingDay",
                l.next_billing_date as "nextBillingDate",
                l.last_billing_date as "lastBillingDate",
                l.company_id as "companyId"
             FROM leases l
             JOIN tenant_accounts ta ON ta.tenant_id = l.tenant_id AND ta.lease_id = l.id
             WHERE l.status = 'active'
               AND l.deleted_at IS NULL
               AND (
                   l.next_billing_date IS NULL 
                   OR l.next_billing_date <= $1
               )
               AND (
                   l.billing_day IS NULL 
                   OR l.billing_day = $2
               )
               AND l.start_date <= $1
               AND l.end_date >= $1`,
            [billingDate, dayOfMonth]
        );

        return result;
    }

    /**
     * Updates the next billing date for a lease.
     */
    async updateLeaseNextBillingDate(
        leaseId: string,
        nextBillingDate: Date,
        lastBillingDate: Date
    ): Promise<void> {
        await AppDataSource.query(
            `UPDATE leases 
             SET next_billing_date = $2,
                 last_billing_date = $3,
                 updated_at = NOW()
             WHERE id = $1`,
            [leaseId, nextBillingDate, lastBillingDate]
        );
    }

    /**
     * Maps a database row to an InvoiceRecord.
     */
    private mapToRecord(row: Record<string, unknown>): InvoiceRecord {
        return {
            id: row.id as string,
            leaseId: row.lease_id as string,
            ownerId: row.owner_id as string,
            tenantAccountId: row.tenant_account_id as string,
            invoiceNumber: row.invoice_number as string,
            periodStart: new Date(row.period_start as string),
            periodEnd: new Date(row.period_end as string),
            subtotal: Number.parseFloat(row.subtotal as string),
            lateFee: Number.parseFloat(row.late_fee as string),
            adjustments: Number.parseFloat(row.adjustments as string),
            total: Number.parseFloat(row.total as string),
            currencyCode: row.currency_code as string,
            amountPaid: Number.parseFloat(row.amount_paid as string),
            dueDate: new Date(row.due_date as string),
            status: row.status as InvoiceStatus,
            issuedAt: row.issued_at ? new Date(row.issued_at as string) : undefined,
            originalAmount: row.original_amount
                ? Number.parseFloat(row.original_amount as string)
                : undefined,
            originalCurrency: row.original_currency as string | undefined,
            exchangeRateUsed: row.exchange_rate_used
                ? Number.parseFloat(row.exchange_rate_used as string)
                : undefined,
            withholdingIibb: Number.parseFloat(row.withholding_iibb as string),
            withholdingIva: Number.parseFloat(row.withholding_iva as string),
            withholdingGanancias: Number.parseFloat(row.withholding_ganancias as string),
            withholdingsTotal: Number.parseFloat(row.withholdings_total as string),
            createdAt: new Date(row.created_at as string),
        };
    }
}
