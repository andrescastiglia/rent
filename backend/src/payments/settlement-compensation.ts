import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { paymentCents, paymentNumber } from './payment-amount';

/** Preserve historical transfers and record the owner's debt at the original commission rate. */
export async function compensateTransferredAllocation(
  manager: EntityManager,
  input: {
    companyId: string;
    invoiceId: string;
    paymentId: string;
    referenceId: string;
    amount: bigint;
  },
): Promise<void> {
  const sources = await manager.query<
    {
      settlementId: string;
      currency: string;
      gross: string;
      collected: string;
      rate: string;
    }[]
  >(
    `SELECT s.id AS "settlementId",s.currency,src.snapshot->>'grossAmount' AS gross,
      src.snapshot->>'collectedAmount' AS collected,g.snapshot->'calculation'->>'commissionRate' AS rate
    FROM settlement_generation_sources src JOIN settlement_generations g ON g.id=src.generation_id
    JOIN settlements s ON s.id=g.settlement_id
    WHERE src.company_id=$1 AND src.invoice_id=$2 AND g.state='active' AND s.status='completed'
    ORDER BY s.id`,
    [input.companyId, input.invoiceId],
  );
  for (const source of sources) {
    const gross = paymentCents(source.gross),
      collected = paymentCents(source.collected),
      rate = paymentCents(source.rate);
    if (collected <= 0n || input.amount > collected || rate > 10000n)
      throw new ConflictException(
        'Transferred settlement source requires reconciliation',
      );
    // Cumulative rounding preserves exact cents across successive partial refunds.
    const [previous] = await manager.query(
      `SELECT COALESCE(SUM(gross_amount),0)::text AS gross,
      COALESCE(SUM(commission_amount),0)::text AS commission, COALESCE(SUM(collected_amount),0)::text AS collected FROM settlement_source_compensations
      WHERE settlement_id=$1 AND invoice_id=$2`,
      [source.settlementId, input.invoiceId],
    );
    const priorGross = paymentCents(previous?.gross ?? 0),
      priorCommission = paymentCents(previous?.commission ?? 0);
    const [current] = await manager.query(
      `SELECT CASE WHEN i.status IN ('cancelled','refunded') THEN 0
      ELSE GREATEST(0,i.paid_amount-COALESCE((SELECT SUM(c.amount) FROM credit_notes c
        WHERE c.company_id=$1 AND c.invoice_id=i.id AND c.status='issued' AND c.deleted_at IS NULL),0)) END::text AS gross
      FROM invoices i WHERE i.company_id=$1 AND i.id=$2`,
      [input.companyId, input.invoiceId],
    );
    if (!current)
      throw new ConflictException('Settlement invoice is unavailable');
    const currentGross = paymentCents(current.gross);
    const nextGross = currentGross < gross ? gross - currentGross : 0n;
    if (nextGross <= priorGross) continue;
    const refundedGross = nextGross - priorGross;
    const originalCommission = (gross * rate + 5000n) / 10000n;
    const remainingCommission = ((gross - nextGross) * rate + 5000n) / 10000n;
    const commission =
      originalCommission - remainingCommission - priorCommission;
    await manager.query(
      `INSERT INTO settlement_source_compensations
        (company_id,settlement_id,invoice_id,payment_id,reference_id,currency,collected_amount,gross_amount,commission_amount,net_amount)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(settlement_id,invoice_id,reference_id) DO NOTHING`,
      [
        input.companyId,
        source.settlementId,
        input.invoiceId,
        input.paymentId,
        input.referenceId,
        source.currency,
        paymentNumber(input.amount),
        paymentNumber(refundedGross),
        paymentNumber(commission),
        paymentNumber(refundedGross - commission),
      ],
    );
  }
}

/** An in-flight transfer must be reconciled before its source can be changed. */
export async function assertNoUncertainSettlementPayout(
  manager: EntityManager,
  companyId: string,
  invoiceId: string,
) {
  const [pending] = await manager.query(
    `SELECT j.id FROM settlement_generation_sources src
    JOIN settlement_generations g ON g.id=src.generation_id
    JOIN settlement_payout_outbox j ON j.settlement_id=g.settlement_id AND j.company_id=$1
    WHERE src.company_id=$1 AND src.invoice_id=$2 AND g.state='active'
      AND j.status IN ('dispatching','awaiting','needs_review') LIMIT 1`,
    [companyId, invoiceId],
  );
  if (pending)
    throw new ConflictException(
      'Reconcile the in-flight settlement transfer before reversing its collection',
    );
  const [legacy] = await manager.query(
    `SELECT s.id FROM invoices i JOIN settlements s ON s.owner_id=i.owner_id
    WHERE i.company_id=$1 AND i.id=$2 AND s.status='completed' AND s.currency=i.currency
      AND NOT EXISTS(SELECT 1 FROM settlement_generations g WHERE g.company_id=$1 AND g.settlement_id=s.id)
      AND EXISTS(SELECT 1 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id
        WHERE a.company_id=$1 AND a.invoice_id=i.id AND p.company_id=$1
          AND to_char(p.payment_date,'YYYY-MM')=s.period) LIMIT 1`,
    [companyId, invoiceId],
  );
  if (legacy)
    throw new ConflictException(
      'Historical transferred settlement requires source reconciliation before reversal',
    );
}
