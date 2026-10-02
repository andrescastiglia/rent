import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Lease } from '../leases/entities/lease.entity';
import { InvoicesService } from './invoices.service';
import { ScheduledBillingDto } from './dto/scheduled-billing.dto';
import { computeBillingPeriod } from './billing-calendar';
import {
  SCHEDULED_BILLING_ELIGIBILITY,
  scheduledBillingKey,
} from './scheduled-billing';

@Injectable()
export class ScheduledBillingService {
  constructor(
    private readonly db: DataSource,
    private readonly invoices: InvoicesService,
  ) {}

  assertToken(token?: string) {
    const expected = process.env.BATCH_BILLING_INTERNAL_TOKEN?.trim();
    if (!expected)
      throw new ServiceUnavailableException(
        'Batch billing token is not configured',
      );
    const received = Buffer.from(token ?? ''),
      configured = Buffer.from(expected);
    if (
      received.length !== configured.length ||
      !timingSafeEqual(received, configured)
    )
      throw new UnauthorizedException('Invalid batch billing token');
  }

  async process(dto: ScheduledBillingDto) {
    const parsed = ScheduledBillingDto.zodSchema.safeParse(dto);
    if (!parsed.success)
      throw new BadRequestException('Invalid scheduled billing request');
    dto = parsed.data;
    const limit = dto.limit ?? 100;
    const candidates: Array<{
      id: string;
      companyId: string;
      nextBillingDate: string | null;
      paymentFrequency: string;
      paymentDueDay: number;
      billingFrequency: string;
      billingDay: number | null;
    }> = await this.db.query(
      `SELECT l.id,l.company_id AS "companyId",l.next_billing_date::text AS "nextBillingDate",
        l.payment_frequency AS "paymentFrequency",l.payment_due_day AS "paymentDueDay",
        l.billing_frequency AS "billingFrequency",l.billing_day AS "billingDay"
       FROM leases l WHERE ${SCHEDULED_BILLING_ELIGIBILITY}
       AND ($2::uuid IS NULL OR l.company_id=$2) AND ($3::uuid IS NULL OR l.id=$3)
       AND ($4::uuid IS NULL OR l.id>$4) ORDER BY l.id LIMIT $5`,
      [
        dto.billingDate,
        dto.companyId ?? null,
        dto.leaseId ?? null,
        dto.afterLeaseId ?? null,
        limit,
      ],
    );
    const result = {
      processedLeases: candidates.length,
      invoicesProcessed: 0,
      invoicesFailed: 0,
      invoicesSkipped: 0,
      errors: [] as Array<{ leaseId: string; error: string }>,
      totals: [] as Array<{ currencyCode: string; amount: string }>,
      nextCursor: candidates.length === limit ? candidates.at(-1)!.id : null,
    };
    const totals = new Map<string, bigint>();
    for (const candidate of candidates) {
      try {
        if (candidate.billingFrequency === 'custom' && !candidate.billingDay)
          throw new BadRequestException(
            'Custom billing requires a billing day',
          );
        const period = computeBillingPeriod(
          candidate as unknown as Lease,
          {},
          dto.billingDate,
        );
        let dates = {
          periodStart: period.periodStart.toISOString().slice(0, 10),
          periodEnd: period.periodEnd.toISOString().slice(0, 10),
          dueDate: period.dueDate.toISOString().slice(0, 10),
        };
        if (dto.dryRun) {
          result.invoicesSkipped++;
          continue;
        }
        const key = scheduledBillingKey(
          candidate.companyId,
          candidate.id,
          dto.billingDate,
        );
        const [previous] = await this.db.query(
          'SELECT request FROM invoice_generations WHERE company_id=$1 AND idempotency_key=$2',
          [candidate.companyId, key],
        );
        if (previous) {
          // A lost response must not turn the same scheduled day into another overdue period.
          dates = {
            periodStart: previous.request.periodStart,
            periodEnd: previous.request.periodEnd,
            dueDate: previous.request.dueDate,
          };
        }
        const invoice = await this.invoices.generateForLease(
          candidate.id,
          {
            ...dates,
            issue: true,
            applyAdjustment: true,
            applyLateFee: false,
            idempotencyKey: key,
          },
          candidate.companyId,
          { billingDate: dto.billingDate },
        );
        const [whole, fraction = ''] = String(invoice.total).split('.');
        const cents =
          BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
        totals.set(
          invoice.currencyCode,
          (totals.get(invoice.currencyCode) ?? 0n) + cents,
        );
        result.invoicesProcessed++;
      } catch (error) {
        result.invoicesFailed++;
        result.errors.push({
          leaseId: candidate.id,
          error: error instanceof Error ? error.message : 'Billing failed',
        });
      }
    }
    result.totals = [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyCode, amount]) => ({
        currencyCode,
        amount: `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`,
      }));
    return result;
  }
}
