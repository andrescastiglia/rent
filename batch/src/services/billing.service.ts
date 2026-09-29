import { InvoiceService } from "./invoice.service";
import { z } from "zod";

const pageSchema = z
  .object({
    processedLeases: z.number().int().nonnegative(),
    invoicesProcessed: z.number().int().nonnegative(),
    invoicesFailed: z.number().int().nonnegative(),
    invoicesSkipped: z.number().int().nonnegative(),
    errors: z.array(z.object({ leaseId: z.uuid(), error: z.string() })),
    totals: z.array(
      z.object({
        currencyCode: z.string().regex(/^[A-Z]{3}$/),
        amount: z.string().regex(/^\d+\.\d{2}$/),
      }),
    ),
    nextCursor: z.uuid().nullable(),
  })
  .refine(
    (p) =>
      p.processedLeases ===
        p.invoicesProcessed + p.invoicesFailed + p.invoicesSkipped &&
      p.errors.length === p.invoicesFailed,
  );

export type BillingRunResult = Omit<z.infer<typeof pageSchema>, "nextCursor">;
export interface OverdueRunResult {
  processed: number;
  markedOverdue: number;
}

/** Billing writes belong to the backend transaction; this client only schedules pages. */
export class BillingService {
  constructor(private readonly invoiceService = new InvoiceService()) {}

  async runBilling(
    billingDate: string,
    dryRun = false,
    leaseId?: string,
    companyId?: string,
  ): Promise<BillingRunResult> {
    z.iso.date().parse(billingDate);
    if (leaseId) z.uuid().parse(leaseId);
    if (companyId) z.uuid().parse(companyId);
    const token = process.env.BATCH_BILLING_INTERNAL_TOKEN?.trim();
    if (!token) throw new Error("BATCH_BILLING_INTERNAL_TOKEN not configured");
    const url = (
      process.env.BACKEND_INTERNAL_URL ??
      `http://localhost:${process.env.BACKEND_PORT ?? "3001"}`
    ).replace(/\/$/, "");
    const result: BillingRunResult = {
      processedLeases: 0,
      invoicesProcessed: 0,
      invoicesFailed: 0,
      invoicesSkipped: 0,
      errors: [],
      totals: [],
    };
    const totals = new Map<string, bigint>();
    let afterLeaseId: string | undefined;
    do {
      const response = await fetch(`${url}/invoices/internal/generate-due`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          "x-batch-billing-token": token,
        },
        body: JSON.stringify({
          billingDate,
          dryRun,
          leaseId,
          companyId,
          afterLeaseId,
          limit: 100,
        }),
      });
      if (!response.ok)
        throw new Error(`Scheduled billing failed: HTTP ${response.status}`);
      const page = pageSchema.parse(await response.json());
      if (page.nextCursor && afterLeaseId && page.nextCursor <= afterLeaseId)
        throw new Error("Billing pagination did not advance");
      for (const key of [
        "processedLeases",
        "invoicesProcessed",
        "invoicesFailed",
        "invoicesSkipped",
      ] as const)
        result[key] += page[key];
      result.errors.push(...page.errors);
      for (const total of page.totals) {
        const [whole, fraction] = total.amount.split(".");
        totals.set(
          total.currencyCode,
          (totals.get(total.currencyCode) ?? 0n) +
            BigInt(whole) * 100n +
            BigInt(fraction),
        );
      }
      afterLeaseId = page.nextCursor ?? undefined;
    } while (afterLeaseId);
    result.totals = [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyCode, amount]) => ({
        currencyCode,
        amount: `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`,
      }));
    return result;
  }

  async processOverdue(): Promise<OverdueRunResult> {
    const markedOverdue = await this.invoiceService.markOverdue();
    return { processed: markedOverdue, markedOverdue };
  }
}
