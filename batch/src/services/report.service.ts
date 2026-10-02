import PDFDocument from "pdfkit";
import type { EntityManager } from "typeorm";
type ReportDatabase = Pick<EntityManager, "query">;
import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";

export type ReportType = "monthly_summary" | "settlement";
export interface FinancialTotals {
  subtotal: number;
  withholdings: number;
  total: number;
  paid: number;
  pending: number;
}
export interface MonthlySummaryData {
  ownerId: string;
  ownerName: string;
  month: number;
  year: number;
  invoices: Array<{
    invoiceNumber: string;
    tenantName: string;
    propertyAddress: string;
    currency: string;
    subtotal: number;
    withholdings: number;
    total: number;
    paid: number;
    pending: number;
    status: string;
  }>;
  totalsByCurrency: Record<string, FinancialTotals>;
}
export interface SettlementData {
  ownerId: string;
  ownerName: string;
  ownerCuit?: string;
  period: string;
  settlements: Array<{
    id: string;
    currency: string;
    status: string;
    grossAmount: number;
    commissionAmount: number;
    withholdingsAmount: number;
    netAmount: number;
    invoices: Array<{ invoiceNumber: string; grossAmount: string }>;
  }>;
  totalsByCurrency: Record<
    string,
    {
      grossAmount: number;
      commissionAmount: number;
      withholdingsAmount: number;
      netAmount: number;
    }
  >;
}
export interface ReportResult {
  success: boolean;
  pdfUrl?: string;
  pdfBuffer?: Buffer;
  error?: string;
}

/** Reports read accounting records; they never generate or simulate a settlement. */
export class ReportService {
  async generateMonthlySummary(
    ownerId: string,
    year: number,
    month: number,
    dryRun = false,
  ): Promise<ReportResult> {
    return this.generate(
      ownerId,
      "monthly_summary",
      `${year}-${String(month).padStart(2, "0")}`,
      dryRun,
    );
  }

  async generateSettlement(
    ownerId: string,
    period: string,
    dryRun = false,
  ): Promise<ReportResult> {
    return this.generate(ownerId, "settlement", period, dryRun);
  }

  private async generate(
    ownerId: string,
    type: ReportType,
    period: string,
    dryRun: boolean,
  ): Promise<ReportResult> {
    try {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
        throw new Error("Report period must be YYYY-MM");
      const [year, month] = period.split("-").map(Number);
      const data = await AppDataSource.transaction(
        "REPEATABLE READ",
        async (database) => {
          await database.query("SET TRANSACTION READ ONLY");
          return type === "monthly_summary"
            ? this.fetchMonthlySummaryData(ownerId, year, month, database)
            : this.fetchSettlementData(ownerId, period, database);
        },
      );
      const pdfBuffer = await this.writePdf((doc) => {
        doc
          .fontSize(18)
          .text(
            type === "monthly_summary"
              ? "Resumen mensual"
              : "Liquidaciones registradas",
            { align: "center" },
          );
        doc
          .fontSize(12)
          .text(`${data.ownerName} · ${period}`, { align: "center" });
        doc.moveDown();
        if ("invoices" in data) this.renderMonthly(doc, data);
        else this.renderSettlements(doc, data);
      });
      if (dryRun) return { success: true, pdfBuffer };
      const filename = `${type}_${ownerId}_${period}.pdf`;
      const pdfUrl = await this.persistPdfDocument(
        ownerId,
        type,
        filename,
        `${type === "monthly_summary" ? "Resumen mensual" : "Liquidaciones"} ${period}`,
        pdfBuffer,
        { period, currencies: Object.keys(data.totalsByCurrency) },
      );
      return { success: true, pdfUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Report generation failed", {
        ownerId,
        type,
        period,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  private renderMonthly(
    doc: InstanceType<typeof PDFDocument>,
    data: MonthlySummaryData,
  ): void {
    if (!data.invoices.length)
      doc.text("No hay facturas registradas para este período.");
    for (const invoice of data.invoices) {
      this.ensureSpace(doc, 78);
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          `${invoice.invoiceNumber} · ${invoice.currency} · ${invoice.status}`,
        );
      doc
        .font("Helvetica")
        .text(`${invoice.tenantName} · ${invoice.propertyAddress}`);
      doc.text(
        `Total: ${this.formatCurrency(invoice.total, invoice.currency)} · Cobrado: ${this.formatCurrency(invoice.paid, invoice.currency)} · Pendiente: ${this.formatCurrency(invoice.pending, invoice.currency)}`,
      );
      doc.moveDown(0.5);
    }
    for (const [currency, totals] of Object.entries(data.totalsByCurrency)) {
      this.ensureSpace(doc, 110);
      doc.font("Helvetica-Bold").fontSize(12).text(`Totales ${currency}`);
      doc.font("Helvetica").fontSize(10);
      for (const [label, amount] of Object.entries({
        Subtotal: totals.subtotal,
        Retenciones: totals.withholdings,
        Total: totals.total,
        Cobrado: totals.paid,
        Pendiente: totals.pending,
      }))
        doc.text(`${label}: ${this.formatCurrency(amount, currency)}`);
      doc.moveDown();
    }
  }

  private renderSettlements(
    doc: InstanceType<typeof PDFDocument>,
    data: SettlementData,
  ): void {
    if (data.ownerCuit) doc.text(`CUIT: ${data.ownerCuit}`);
    if (!data.settlements.length)
      doc.text(
        "No hay liquidaciones registradas para este período. Este informe no calcula ni autoriza transferencias.",
      );
    for (const settlement of data.settlements) {
      this.ensureSpace(doc, 125);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(
          `${settlement.id} · ${settlement.currency} · ${settlement.status}`,
        );
      doc.font("Helvetica").fontSize(10);
      doc.text(
        `Bruto: ${this.formatCurrency(settlement.grossAmount, settlement.currency)}`,
      );
      doc.text(
        `Comisión registrada: ${this.formatCurrency(settlement.commissionAmount, settlement.currency)}`,
      );
      doc.text(
        `Retenciones: ${this.formatCurrency(settlement.withholdingsAmount, settlement.currency)}`,
      );
      doc.text(
        `Neto registrado: ${this.formatCurrency(settlement.netAmount, settlement.currency)}`,
      );
      if (!settlement.invoices.length)
        doc.text(
          "Liquidación histórica: detalle de origen pendiente de conciliación.",
        );
      for (const invoice of settlement.invoices) {
        this.ensureSpace(doc, 25);
        doc.text(
          `${invoice.invoiceNumber}: ${this.formatCurrency(this.amount(invoice.grossAmount), settlement.currency)}`,
        );
      }
      doc.moveDown();
    }
    for (const [currency, totals] of Object.entries(data.totalsByCurrency)) {
      this.ensureSpace(doc, 95);
      doc.font("Helvetica-Bold").text(`Totales registrados ${currency}`);
      doc.font("Helvetica");
      doc.text(
        `Bruto: ${this.formatCurrency(totals.grossAmount, currency)} · Comisión: ${this.formatCurrency(totals.commissionAmount, currency)}`,
      );
      doc.text(
        `Retenciones: ${this.formatCurrency(totals.withholdingsAmount, currency)} · Neto: ${this.formatCurrency(totals.netAmount, currency)}`,
      );
      doc.moveDown();
    }
  }

  private ensureSpace(
    doc: InstanceType<typeof PDFDocument>,
    height: number,
  ): void {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom)
      doc.addPage();
  }

  private formatCurrency(amount: number, currency: string): string {
    return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private text(value: unknown): string {
    if (typeof value !== "string")
      throw new TypeError("Invalid accounting text");
    return value;
  }

  private amount(value: unknown): number {
    if (value === null || value === undefined || value === "")
      throw new Error("Missing accounting amount");
    if (typeof value !== "string" && typeof value !== "number")
      throw new TypeError("Invalid accounting amount type");
    if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value))
      throw new TypeError("Invalid accounting amount format");
    const amount = Number(value);
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isSafeInteger(Math.round(amount * 100))
    )
      throw new Error("Invalid accounting amount");
    return Math.round(amount * 100) / 100;
  }

  private add(left: number, right: number): number {
    return (Math.round(left * 100) + Math.round(right * 100)) / 100;
  }

  private async owner(
    ownerId: string,
    database: ReportDatabase = AppDataSource,
  ): Promise<{ companyId: string; name: string; taxId?: string }> {
    const [owner] = await database.query(
      `SELECT o.company_id AS "companyId", o.tax_id AS "taxId",
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email, 'Propietario') AS name
       FROM owners o LEFT JOIN users u ON u.id=o.user_id AND u.company_id=o.company_id
       WHERE o.id=$1 AND o.deleted_at IS NULL`,
      [ownerId],
    );
    if (!owner?.companyId) throw new Error(`Owner not found: ${ownerId}`);
    return owner;
  }

  private async fetchMonthlySummaryData(
    ownerId: string,
    year: number,
    month: number,
    database: ReportDatabase,
  ): Promise<MonthlySummaryData> {
    const owner = await this.owner(ownerId, database);
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const rows = await database.query(
      `SELECT i.invoice_number AS "invoiceNumber", i.currency,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', tu.first_name, tu.last_name)), ''), 'Inquilino') AS "tenantName",
        CONCAT_WS(' ', p.address_street, p.address_number) AS "propertyAddress", i.subtotal,
        (COALESCE(i.withholding_iibb,0)+COALESCE(i.withholding_ganancias,0)+COALESCE(i.withholding_other,0)) AS withholdings,
        i.total_amount AS total, i.paid_amount AS paid, i.status,
        COALESCE(a.collected,0) AS collected, COALESCE(c.credited,0) AS credited
       FROM invoices i
       JOIN leases l ON l.id=i.lease_id AND l.company_id=$2
       JOIN properties p ON p.id=l.property_id AND p.company_id=$2
       LEFT JOIN tenant_accounts ta ON ta.id=i.tenant_account_id AND ta.company_id=$2
       LEFT JOIN tenants t ON t.id=ta.tenant_id AND t.company_id=$2
       LEFT JOIN users tu ON tu.id=t.user_id AND tu.company_id=$2
       LEFT JOIN LATERAL (
         SELECT SUM(pa.amount-pa.refunded_amount) AS collected FROM payment_allocations pa
         JOIN payments payment ON payment.id=pa.payment_id AND payment.company_id=$2
         WHERE pa.invoice_id=i.id AND pa.company_id=$2 AND pa.reversed_at IS NULL
           AND payment.status='completed' AND payment.allocations_recorded AND payment.deleted_at IS NULL AND payment.currency=i.currency
           AND payment.tenant_id=ta.tenant_id
           AND COALESCE(payment.tenant_account_id, (SELECT origin.tenant_account_id FROM invoices origin WHERE origin.id=payment.invoice_id AND origin.company_id=$2))=i.tenant_account_id
           AND (SELECT SUM(active.amount-active.refunded_amount) FROM payment_allocations active WHERE active.payment_id=payment.id AND active.reversed_at IS NULL)<=(payment.amount-payment.refunded_amount)
       ) a ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(cn.amount) AS credited FROM credit_notes cn WHERE cn.invoice_id=i.id AND cn.company_id=$2
           AND cn.status='issued' AND cn.deleted_at IS NULL AND cn.currency=i.currency
       ) c ON TRUE
       WHERE i.owner_id=$1 AND i.company_id=$2 AND i.deleted_at IS NULL AND i.status<>'cancelled'
         AND i.period_start>=($3 || '-01')::date AND i.period_start<(($3 || '-01')::date+INTERVAL '1 month')
       ORDER BY i.created_at, i.id`,
      [ownerId, owner.companyId, period],
    );
    const totalsByCurrency: MonthlySummaryData["totalsByCurrency"] = {};
    const invoices = rows.map((row: Record<string, unknown>) => {
      const currency = typeof row.currency === "string" ? row.currency : "";
      if (!currency) throw new Error("Missing invoice currency");
      const collected = this.amount(row.collected);
      const paid = this.amount(row.paid);
      if (collected !== paid)
        throw new Error(
          `Invoice ${row.invoiceNumber} requires collection reconciliation`,
        );
      const total = Math.max(
        0,
        this.add(this.amount(row.total), -this.amount(row.credited)),
      );
      const pending = Math.max(0, this.add(total, -paid));
      const invoice = {
        invoiceNumber: this.text(row.invoiceNumber),
        tenantName: this.text(row.tenantName),
        propertyAddress: this.text(row.propertyAddress),
        currency,
        subtotal: this.amount(row.subtotal),
        withholdings: this.amount(row.withholdings),
        total,
        paid,
        pending,
        status: this.text(row.status),
      };
      const totals = (totalsByCurrency[currency] ??= {
        subtotal: 0,
        withholdings: 0,
        total: 0,
        paid: 0,
        pending: 0,
      });
      for (const key of [
        "subtotal",
        "withholdings",
        "total",
        "paid",
        "pending",
      ] as const)
        totals[key] = this.add(totals[key], invoice[key]);
      return invoice;
    });
    return {
      ownerId,
      ownerName: owner.name,
      month,
      year,
      invoices,
      totalsByCurrency,
    };
  }

  private async fetchSettlementData(
    ownerId: string,
    period: string,
    database: ReportDatabase,
  ): Promise<SettlementData> {
    const owner = await this.owner(ownerId, database);
    const rows = await database.query(
      `SELECT s.id,s.currency,s.status,s.gross_amount AS "grossAmount",s.commission_amount AS "commissionAmount",
         s.withholdings_amount AS "withholdingsAmount",s.net_amount AS "netAmount",
         COALESCE(g.snapshot->'calculation'->'invoices','[]'::jsonb) AS invoices
       FROM settlements s JOIN owners o ON o.id=s.owner_id AND o.company_id=$2 AND o.deleted_at IS NULL
       LEFT JOIN settlement_generations g ON g.settlement_id=s.id AND g.company_id=$2
       WHERE s.owner_id=$1 AND s.period=$3 AND s.status<>'cancelled' ORDER BY s.created_at,s.id`,
      [ownerId, owner.companyId, period],
    );
    const totalsByCurrency: SettlementData["totalsByCurrency"] = {};
    const settlements = rows.map((row: Record<string, unknown>) => {
      const currency = typeof row.currency === "string" ? row.currency : "";
      if (!currency) throw new Error("Missing settlement currency");
      const settlement = {
        id: this.text(row.id),
        currency,
        status: this.text(row.status),
        grossAmount: this.amount(row.grossAmount),
        commissionAmount: this.amount(row.commissionAmount),
        withholdingsAmount: this.amount(row.withholdingsAmount),
        netAmount: this.amount(row.netAmount),
        invoices:
          row.invoices as SettlementData["settlements"][number]["invoices"],
      };
      if (
        this.add(
          this.add(settlement.grossAmount, -settlement.commissionAmount),
          -settlement.withholdingsAmount,
        ) !== settlement.netAmount
      )
        throw new Error(
          `Settlement ${settlement.id} requires accounting reconciliation`,
        );
      const totals = (totalsByCurrency[currency] ??= {
        grossAmount: 0,
        commissionAmount: 0,
        withholdingsAmount: 0,
        netAmount: 0,
      });
      for (const key of [
        "grossAmount",
        "commissionAmount",
        "withholdingsAmount",
        "netAmount",
      ] as const)
        totals[key] = this.add(totals[key], settlement[key]);
      return settlement;
    });
    return {
      ownerId,
      ownerName: owner.name,
      ownerCuit: owner.taxId,
      period,
      settlements,
      totalsByCurrency,
    };
  }

  private async writePdf(
    render: (doc: InstanceType<typeof PDFDocument>) => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer | Uint8Array) =>
        chunks.push(Buffer.from(chunk)),
      );
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      try {
        render(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async persistPdfDocument(
    ownerId: string,
    reportType: ReportType,
    filename: string,
    description: string,
    pdfBuffer: Buffer,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const owner = await this.owner(ownerId);
    // A single statement persists the bytes and their final URL atomically.
    const [document] = await AppDataSource.query(
      `WITH identity AS (SELECT gen_random_uuid() AS id)
       INSERT INTO documents(id,company_id,document_type,status,name,description,file_url,file_size,file_mime_type,entity_type,entity_id,metadata,file_data)
       SELECT id,$1,'other','approved',$2,$3,'db://document/' || id::text,$4,'application/pdf','owner',$5,$6::jsonb,$7 FROM identity RETURNING id`,
      [
        owner.companyId,
        filename,
        description,
        pdfBuffer.length,
        ownerId,
        JSON.stringify({ reportType, ...metadata }),
        pdfBuffer,
      ],
    );
    if (!document?.id)
      throw new Error(`Failed to persist report PDF for owner ${ownerId}`);
    return `db://document/${document.id}`;
  }
}
