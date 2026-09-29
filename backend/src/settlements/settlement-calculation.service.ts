import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  SettlementCalculationDto,
  SettlementCalculationQueryDto,
  SettlementSourceAllocationDto,
  SettlementSourceCreditDto,
  SettlementSourceInvoiceDto,
} from './dto/settlement-calculation.dto';

interface InvoiceSource {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  paidAmount: string;
  dueDate: string;
  validAccount: boolean;
  allocations: (SettlementSourceAllocationDto & { valid: boolean })[];
  creditNotes: (SettlementSourceCreditDto & { currency: string })[];
}

function cents(value: string): bigint {
  if (!/^\d+\.\d{2}$/.test(value))
    throw new ConflictException('Settlement source has an invalid amount');
  return BigInt(value.replace('.', ''));
}

function money(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

/** Read-only accounting preview. Generation must revalidate and reserve its sources. */
@Injectable()
export class SettlementCalculationService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async preview(
    companyId: string,
    query: SettlementCalculationQueryDto,
  ): Promise<SettlementCalculationDto> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      // Owner, source documents and existing settlements must share one snapshot.
      await manager.query('SET TRANSACTION READ ONLY');
      const [owner] = await manager.query<{ commissionRate: string }[]>(
        `SELECT commission_rate::text AS "commissionRate" FROM owners
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
        [companyId, query.ownerId],
      );
      if (!owner) throw new NotFoundException('Owner not found');
      const rate = cents(owner.commissionRate);
      if (rate > 10000n)
        throw new ConflictException('Invalid owner commission rate');

      const sources = await manager.query<InvoiceSource[]>(
        `SELECT i.id, i.invoice_number AS "invoiceNumber",
          i.total_amount::text AS "totalAmount", i.paid_amount::text AS "paidAmount",
          i.due_date::text AS "dueDate",
          (ta.id IS NOT NULL AND l.id IS NOT NULL AND ta.currency=i.currency
            AND ta.lease_id=i.lease_id) AS "validAccount",
          COALESCE(a.items, '[]'::jsonb) AS allocations,
          COALESCE(c.items, '[]'::jsonb) AS "creditNotes"
         FROM invoices i
         LEFT JOIN tenant_accounts ta ON ta.id=i.tenant_account_id AND ta.company_id=$1
         LEFT JOIN leases l ON l.id=i.lease_id AND l.company_id=$1
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'id', pa.id, 'paymentId', pa.payment_id, 'amount', pa.amount::text,
             'paymentDate', p.payment_date::text,
             'valid', COALESCE(p.status='completed' AND p.allocations_recorded
               AND p.deleted_at IS NULL AND p.currency=i.currency
               AND p.tenant_id=ta.tenant_id
               AND COALESCE(p.tenant_account_id, pi.tenant_account_id)=i.tenant_account_id
               AND (SELECT SUM(allocation.amount) FROM payment_allocations allocation
                    WHERE allocation.payment_id=p.id AND allocation.reversed_at IS NULL)<=p.amount, false)
           ) ORDER BY pa.id) AS items
           FROM payment_allocations pa
           LEFT JOIN payments p ON p.id=pa.payment_id AND p.company_id=$1
           LEFT JOIN invoices pi ON pi.id=p.invoice_id AND pi.company_id=$1
           WHERE pa.company_id=$1 AND pa.invoice_id=i.id AND pa.reversed_at IS NULL
         ) a ON TRUE
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object('id', cn.id, 'amount', cn.amount::text,
             'currency', cn.currency) ORDER BY cn.id) AS items
           FROM credit_notes cn WHERE cn.company_id=$1 AND cn.invoice_id=i.id
             AND cn.status='issued' AND cn.deleted_at IS NULL
         ) c ON TRUE
         WHERE i.company_id=$1 AND i.owner_id=$2 AND i.currency=$3
           AND i.period_start >= ($4 || '-01')::date
           AND i.period_start < (($4 || '-01')::date + INTERVAL '1 month')
           AND i.status='paid' AND i.deleted_at IS NULL
         ORDER BY i.id`,
        [companyId, query.ownerId, query.currency, query.period],
      );
      const invoices: SettlementSourceInvoiceDto[] = sources.map((source) => {
        if (
          !source.validAccount ||
          source.allocations.some((a) => !a.valid) ||
          source.creditNotes.some((c) => c.currency !== query.currency)
        )
          throw new ConflictException(
            'Settlement source requires accounting review',
          );
        const collected = source.allocations.reduce(
          (sum, a) => sum + cents(a.amount),
          0n,
        );
        const credits = source.creditNotes.reduce(
          (sum, c) => sum + cents(c.amount),
          0n,
        );
        if (
          !source.allocations.length ||
          collected !== cents(source.totalAmount) ||
          collected !== cents(source.paidAmount) ||
          credits > collected
        )
          throw new ConflictException(
            'Paid invoice does not match its recorded collections and credits',
          );
        // Invoice totals already include billing deductions. Do not deduct them twice.
        return {
          id: source.id,
          invoiceNumber: source.invoiceNumber,
          totalAmount: source.totalAmount,
          dueDate: source.dueDate,
          collectedAmount: money(collected),
          creditedAmount: money(credits),
          grossAmount: money(collected - credits),
          scheduledDate: source.allocations.reduce(
            (latest, a) => (a.paymentDate > latest ? a.paymentDate : latest),
            source.dueDate,
          ),
          allocations: source.allocations.map(
            ({ id, paymentId, amount, paymentDate }) => ({
              id,
              paymentId,
              amount,
              paymentDate,
            }),
          ),
          creditNotes: source.creditNotes.map(({ id, amount }) => ({
            id,
            amount,
          })),
        };
      });
      const gross = invoices.reduce((sum, i) => sum + cents(i.grossAmount), 0n);
      // Round once for the whole settlement, half a cent away from zero.
      const commission = (gross * rate + 5000n) / 10000n;
      const existing = await manager.query<{ id: string }[]>(
        'SELECT id FROM settlements WHERE owner_id=$1 AND period=$2 ORDER BY id',
        [query.ownerId, query.period],
      );
      const calculation = {
        ownerId: query.ownerId,
        period: query.period,
        currency: query.currency,
        commissionRate: owner.commissionRate,
        grossAmount: money(gross),
        commissionAmount: money(commission),
        netBeforeWithholdings: money(gross - commission),
        scheduledDate: invoices.reduce<string | null>(
          (latest, i) =>
            !latest || i.scheduledDate > latest ? i.scheduledDate : latest,
          null,
        ),
        existingSettlementIds: existing.map((s) => s.id),
        invoices,
      };
      return {
        ...calculation,
        fingerprint: createHash('sha256')
          .update(JSON.stringify({ version: 1, companyId, ...calculation }))
          .digest('hex'),
      };
    });
  }
}
