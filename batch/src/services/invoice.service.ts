import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import * as PDFDocument from "pdfkit";

const TEMPLATE_PLACEHOLDER_REGEX = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

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
 * Data required to create a new invoice.
 */
export interface CreateInvoiceData {
  companyId?: string;
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
  pdfUrl?: string;
  createdAt: Date;
}

/**
 * Lease data needed for billing.
 */
export interface LeaseForBilling {
  id: string;
  tenantId: string;
  ownerId: string;
  tenantAccountId: string;
  rentAmount: number;
  currency: string;
  paymentFrequency: "monthly" | "biweekly" | "weekly";
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
      [ownerId, year],
    );

    const count = Number.parseInt(result[0].count, 10) + 1;
    return `${year}-${count.toString().padStart(6, "0")}`;
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
                    'pending', NOW(),
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
          data.currencyCode || "ARS",
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
        ],
      );

      logger.info("Invoice created", {
        invoiceNumber,
        leaseId: data.leaseId,
        total: data.total,
      });

      const created = this.mapToRecord(result[0]);
      const pdfUrl = await this.generateAndPersistPdf(created, data.companyId);
      if (pdfUrl) {
        created.pdfUrl = pdfUrl;
      }
      return created;
    } catch (error) {
      logger.error("Failed to create invoice", {
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
             WHERE status IN ('pending', 'sent', 'partial')
               AND deleted_at IS NULL
               AND due_date <= CURRENT_DATE + $1::interval
               AND due_date >= CURRENT_DATE
             ORDER BY due_date ASC`,
      [`${daysBefore} days`],
    );

    return result.map(this.mapToRecord);
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

    const count = result.length;
    if (count > 0) {
      logger.info("Marked invoices as overdue", { count });
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
  async applyLateFee(
    invoiceId: string,
    lateFee: number,
  ): Promise<InvoiceRecord> {
    const result = await AppDataSource.query(
      `UPDATE invoices 
             SET late_fee = late_fee + $2,
                 total = total + $2,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
      [invoiceId, lateFee],
    );

    if (result.length === 0) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    logger.info("Late fee applied", { invoiceId, lateFee });

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
               AND l.contract_type = 'rental'
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
      [billingDate, dayOfMonth],
    );

    return result;
  }

  /**
   * Updates the next billing date for a lease.
   */
  async updateLeaseNextBillingDate(
    leaseId: string,
    nextBillingDate: Date,
    lastBillingDate: Date,
  ): Promise<void> {
    await AppDataSource.query(
      `UPDATE leases 
             SET next_billing_date = $2,
                 last_billing_date = $3,
                 updated_at = NOW()
             WHERE id = $1`,
      [leaseId, nextBillingDate, lastBillingDate],
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
      adjustments: Number.parseFloat(
        (row.discount_amount ?? row.adjustments ?? 0) as string,
      ),
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
      withholdingGanancias: Number.parseFloat(
        row.withholding_ganancias as string,
      ),
      withholdingsTotal: Number.parseFloat(row.withholdings_total as string),
      pdfUrl: (row.pdf_url as string | null) ?? undefined,
      createdAt: new Date(row.created_at as string),
    };
  }

  private async generateAndPersistPdf(
    invoice: InvoiceRecord,
    companyId?: string,
  ): Promise<string | null> {
    if (!companyId) {
      logger.warn(
        "Skipping batch invoice PDF generation because companyId is missing",
        {
          invoiceId: invoice.id,
        },
      );
      return null;
    }

    const pdfBuffer = await this.generateInvoicePdfBuffer(invoice, companyId);

    const documentResult = await AppDataSource.query(
      `INSERT INTO documents (
                company_id,
                document_type,
                status,
                name,
                description,
                file_url,
                file_size,
                file_mime_type,
                entity_type,
                entity_id,
                metadata,
                file_data
             ) VALUES (
                $1,
                'other',
                'approved',
                $2,
                $3,
                'db://pending',
                $4,
                'application/pdf',
                'invoice',
                $5,
                '{}'::jsonb,
                $6
             )
             RETURNING id`,
      [
        companyId,
        `factura-${invoice.invoiceNumber}.pdf`,
        `Factura generada por lote ${invoice.invoiceNumber}`,
        pdfBuffer.length,
        invoice.id,
        pdfBuffer,
      ],
    );

    const documentId = documentResult[0]?.id as string | undefined;
    if (!documentId) {
      return null;
    }

    const dbUrl = `db://document/${documentId}`;

    await AppDataSource.query(
      `UPDATE documents
             SET file_url = $2
             WHERE id = $1`,
      [documentId, dbUrl],
    );

    await AppDataSource.query(
      `UPDATE invoices
             SET pdf_url = $2,
                 updated_at = NOW()
             WHERE id = $1`,
      [invoice.id, dbUrl],
    );

    logger.info("Batch invoice PDF persisted in database", {
      invoiceId: invoice.id,
      documentId,
    });

    return dbUrl;
  }

  private async generateInvoicePdfBuffer(
    invoice: InvoiceRecord,
    companyId?: string,
  ): Promise<Buffer> {
    if (companyId) {
      const templateBody = await this.findActiveInvoiceTemplate(companyId);
      if (templateBody) {
        return this.generateTemplateInvoicePdfBuffer(invoice, templateBody);
      }
    }

    return this.generateDefaultInvoicePdfBuffer(invoice);
  }

  private generateDefaultInvoicePdfBuffer(
    invoice: InvoiceRecord,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const PDFCtor = (PDFDocument as any).default ?? (PDFDocument as any);
      const doc = new PDFCtor({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer | Uint8Array) =>
        chunks.push(Buffer.from(chunk)),
      );
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("Factura", { align: "center" });
      doc.moveDown();
      doc.fontSize(10).font("Helvetica");
      doc.text(`Numero: ${invoice.invoiceNumber}`);
      doc.text(
        `Fecha emision: ${
          invoice.issuedAt
            ? invoice.issuedAt.toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        }`,
      );
      doc.text(`Vencimiento: ${invoice.dueDate.toISOString().slice(0, 10)}`);
      doc.text(
        `Periodo: ${invoice.periodStart.toISOString().slice(0, 10)} al ${invoice.periodEnd.toISOString().slice(0, 10)}`,
      );
      doc.moveDown();
      doc.text(
        `Subtotal: ${invoice.currencyCode} ${invoice.subtotal.toLocaleString("es-AR")}`,
      );
      doc.text(
        `Mora: ${invoice.currencyCode} ${invoice.lateFee.toLocaleString("es-AR")}`,
      );
      doc.text(
        `Ajustes: ${invoice.currencyCode} ${invoice.adjustments.toLocaleString("es-AR")}`,
      );
      doc.text(
        `Total: ${invoice.currencyCode} ${invoice.total.toLocaleString("es-AR")}`,
      );
      doc.moveDown(2);
      doc.fontSize(8).text(`ID factura: ${invoice.id}`, { align: "center" });

      doc.end();
    });
  }

  private async generateTemplateInvoicePdfBuffer(
    invoice: InvoiceRecord,
    templateBody: string,
  ): Promise<Buffer> {
    const context = await this.buildInvoiceTemplateContext(invoice);
    const rendered = this.renderTemplate(templateBody, context);

    return new Promise((resolve, reject) => {
      const PDFCtor = (PDFDocument as any).default ?? (PDFDocument as any);
      const doc = new PDFCtor({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer | Uint8Array) =>
        chunks.push(Buffer.from(chunk)),
      );
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(`Factura ${invoice.invoiceNumber}`, { align: "center" });
      doc.moveDown();
      doc.fontSize(10).font("Helvetica").text(rendered, {
        align: "left",
        lineGap: 4,
      });
      doc.moveDown(2);
      doc.fontSize(8).text(`ID factura: ${invoice.id}`, { align: "center" });
      doc.end();
    });
  }

  private async findActiveInvoiceTemplate(
    companyId: string,
  ): Promise<string | null> {
    const result = await AppDataSource.query(
      `SELECT template_body
         FROM payment_document_templates
        WHERE company_id = $1
          AND type = 'invoice'
          AND is_active = TRUE
          AND deleted_at IS NULL
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1`,
      [companyId],
    );

    const templateBody = result[0]?.template_body as string | undefined;
    return templateBody ?? null;
  }

  private async buildInvoiceTemplateContext(
    invoice: InvoiceRecord,
  ): Promise<Record<string, unknown>> {
    const detailsResult = await AppDataSource.query(
      `SELECT
          ou.first_name AS owner_first_name,
          ou.last_name AS owner_last_name,
          ou.email AS owner_email,
          tu.first_name AS tenant_first_name,
          tu.last_name AS tenant_last_name,
          tu.email AS tenant_email,
          p.name AS property_name,
          p.address_street AS property_address_street,
          p.address_number AS property_address_number,
          p.address_city AS property_address_city,
          p.address_state AS property_address_state
       FROM invoices i
       LEFT JOIN leases l ON l.id = i.lease_id
       LEFT JOIN properties p ON p.id = l.property_id
       LEFT JOIN owners o ON o.id = i.owner_id
       LEFT JOIN users ou ON ou.id = o.user_id
       LEFT JOIN tenants t ON t.id = l.tenant_id
       LEFT JOIN users tu ON tu.id = t.user_id
       WHERE i.id = $1
       LIMIT 1`,
      [invoice.id],
    );

    const details = (detailsResult[0] ?? {}) as Record<string, string | null>;
    const issueDate =
      invoice.issuedAt?.toISOString().slice(0, 10) ??
      new Date().toISOString().slice(0, 10);

    const ownerFullName =
      `${details.owner_first_name ?? ""} ${details.owner_last_name ?? ""}`.trim();
    const tenantFullName =
      `${details.tenant_first_name ?? ""} ${details.tenant_last_name ?? ""}`.trim();
    const currencySymbol = this.getCurrencySymbol(invoice.currencyCode);

    return {
      today: new Date().toISOString().slice(0, 10),
      invoice: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        issueDate,
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        periodStart: invoice.periodStart.toISOString().slice(0, 10),
        periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
        status: invoice.status,
        subtotal: invoice.subtotal.toFixed(2),
        lateFee: invoice.lateFee.toFixed(2),
        adjustments: invoice.adjustments.toFixed(2),
        total: invoice.total.toFixed(2),
        currency: invoice.currencyCode,
        currencySymbol,
      },
      owner: {
        firstName: details.owner_first_name ?? "",
        lastName: details.owner_last_name ?? "",
        fullName: ownerFullName,
        email: details.owner_email ?? "",
      },
      tenant: {
        firstName: details.tenant_first_name ?? "",
        lastName: details.tenant_last_name ?? "",
        fullName: tenantFullName,
        email: details.tenant_email ?? "",
      },
      property: {
        name: details.property_name ?? "",
        addressStreet: details.property_address_street ?? "",
        addressNumber: details.property_address_number ?? "",
        addressCity: details.property_address_city ?? "",
        addressState: details.property_address_state ?? "",
      },
    };
  }

  private renderTemplate(
    templateBody: string,
    context: Record<string, unknown>,
  ): string {
    return templateBody.replace(
      TEMPLATE_PLACEHOLDER_REGEX,
      (_token, key: string) => {
        const value = key.split(".").reduce<unknown>((current, part) => {
          if (current === null || current === undefined) {
            return undefined;
          }
          if (typeof current !== "object") {
            return undefined;
          }
          return (current as Record<string, unknown>)[part];
        }, context);

        if (value === null || value === undefined) {
          return "";
        }
        if (typeof value === "string") {
          return value;
        }
        return String(value);
      },
    );
  }

  private getCurrencySymbol(code: string): string {
    const symbols: Record<string, string> = {
      ARS: "$",
      USD: "US$",
      BRL: "R$",
    };
    return symbols[code] || code;
  }
}
