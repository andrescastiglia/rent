import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { buildInvoicePaymentUrl } from "./invoice-payment-link";

const toScalarString = (value: unknown, fallback = ""): string => {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      return fallback;
  }
};

const toFloat = (value: unknown): number =>
  Number.parseFloat(toScalarString(value, "0"));

/**
 * Status of an invoice.
 */
export type InvoiceStatus =
  | "draft"
  | "pending"
  | "sent"
  | "paid"
  | "partial"
  | "cancelled"
  | "overdue"
  | "refunded";

/**
 * Invoice record from database.
 */
export interface InvoiceRecord {
  id: string;
  companyId: string;
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
  pdfUrl?: string;
  createdAt: Date;
}

export interface InvoiceReminderContact {
  tenantId: string | null;
  tenantPhone: string | null;
  tenantName: string | null;
  tenantLanguage: string | null;
  whatsappEnabled: boolean;
}

/**
 * Service for managing invoices in the batch system.
 */
export class InvoiceService {
  getPaymentLink(invoiceId: string, locale = "es"): string | null {
    return buildInvoicePaymentUrl(invoiceId, locale);
  }

  /**
   * Finds pending invoices that are due within X days.
   */
  async findPendingDueSoon(daysBefore: number): Promise<InvoiceRecord[]> {
    const result = await AppDataSource.query(
      `SELECT i.*, l.company_id
         FROM invoices i
         JOIN leases l ON l.id = i.lease_id
        WHERE i.status IN ('pending', 'sent', 'partial')
          AND i.deleted_at IS NULL
          AND i.due_date <= CURRENT_DATE + $1::interval
          AND i.due_date >= CURRENT_DATE
        ORDER BY i.due_date ASC`,
      [`${daysBefore} days`],
    );

    return result.map(this.mapToRecord);
  }

  async getReminderContact(invoiceId: string): Promise<InvoiceReminderContact> {
    const result = await AppDataSource.query(
      `SELECT
          t.id AS tenant_id,
          tu.phone AS tenant_phone,
          CONCAT_WS(' ', tu.first_name, tu.last_name) AS tenant_name,
          tu.language AS tenant_language,
          tu.whatsapp_enabled
       FROM invoices i
       JOIN leases l ON l.id = i.lease_id
       JOIN tenants t ON t.id = l.tenant_id
       JOIN users tu ON tu.id = t.user_id
       WHERE i.id = $1
       LIMIT 1`,
      [invoiceId],
    );

    const row = (result[0] ?? {}) as {
      tenant_id?: string | null;
      tenant_phone?: string | null;
      tenant_name?: string | null;
      tenant_language?: string | null;
      whatsapp_enabled?: boolean;
    };

    return {
      tenantId: row.tenant_id ?? null,
      tenantPhone: row.tenant_phone ?? null,
      tenantName: row.tenant_name ?? null,
      tenantLanguage: row.tenant_language ?? null,
      whatsappEnabled: row.whatsapp_enabled === true,
    };
  }

  /**
   * Finds invoices that are overdue (past due date).
   */
  async findOverdue(): Promise<InvoiceRecord[]> {
    const result = await AppDataSource.query(
      `SELECT * FROM invoices 
             WHERE status IN ('pending', 'sent', 'partial')
               AND deleted_at IS NULL
               AND due_date < CURRENT_DATE
             ORDER BY due_date ASC`,
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
             WHERE status IN ('pending', 'sent', 'partial')
               AND deleted_at IS NULL
               AND due_date < CURRENT_DATE
             RETURNING id`,
    );

    const rows = Array.isArray(result[0]) ? result[0] : result;
    const count = rows.length;
    if (count > 0) {
      logger.info("Marked invoices as overdue", { count });
    }

    return count;
  }

  /**
   * Maps a database row to an InvoiceRecord.
   */
  private mapToRecord(row: Record<string, unknown>): InvoiceRecord {
    const lateFeeRaw = row.late_fee_amount ?? row.late_fee ?? 0;
    const adjustmentsRaw = row.discount_amount ?? row.adjustments ?? 0;
    const currencyRaw = row.currency ?? row.currency_code ?? "ARS";
    const issuedAtRaw = row.issue_date ?? row.issued_at;
    const exchangeRateRaw = row.exchange_rate ?? row.exchange_rate_used;

    return {
      id: row.id as string,
      companyId: row.company_id as string,
      leaseId: row.lease_id as string,
      ownerId: row.owner_id as string,
      tenantAccountId: row.tenant_account_id as string,
      invoiceNumber: row.invoice_number as string,
      periodStart: new Date(row.period_start as string),
      periodEnd: new Date(row.period_end as string),
      subtotal: Number.parseFloat(row.subtotal as string),
      lateFee: toFloat(lateFeeRaw),
      adjustments: toFloat(adjustmentsRaw),
      total: Number.parseFloat(row.total_amount as string),
      currencyCode: toScalarString(currencyRaw, "ARS"),
      amountPaid: Number.parseFloat(
        (row.paid_amount ?? row.amount_paid) as string,
      ),
      dueDate: new Date(row.due_date as string),
      status: row.status as InvoiceStatus,
      issuedAt: issuedAtRaw ? new Date(issuedAtRaw as string) : undefined,
      originalAmount: row.original_amount
        ? Number.parseFloat(row.original_amount as string)
        : undefined,
      originalCurrency: row.original_currency as string | undefined,
      exchangeRateUsed: exchangeRateRaw
        ? Number.parseFloat(exchangeRateRaw as string)
        : undefined,
      withholdingIibb: toFloat(row.withholding_iibb ?? 0),
      withholdingIva: toFloat(row.withholding_iva ?? 0),
      withholdingGanancias: toFloat(row.withholding_ganancias ?? 0),
      withholdingsTotal: toFloat(row.withholdings_total ?? 0),
      pdfUrl: (row.pdf_url as string | null) ?? undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}
