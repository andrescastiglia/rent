import { ConflictException } from '@nestjs/common';
import { LateFeeType } from '../leases/entities/lease.entity';
import { paymentCents, paymentNumber } from './payment-amount';

export interface LateFeeCalculation {
  version: 1;
  kind: 'policy';
  asOf: string;
  timeZone: 'America/Argentina/Buenos_Aires';
  currency: string;
  policy: {
    type: string;
    value: string;
    graceDays: number;
    max: string | null;
  };
  sources: Array<{
    invoiceId: string;
    dueDate: string;
    daysOverdue: number;
    chargeableDays: number;
    pendingAmount: string;
    accruedAmount: string;
    previouslyCharged: string;
    amount: string;
  }>;
  amount: number;
}
type SourceInvoice = {
  id: string;
  status: string;
  dueDate: string | Date;
  total: number | string;
  amountPaid: number | string;
  lateFee?: number | string;
  currencyCode?: string;
  lateFeeCalculation?: LateFeeCalculation | null;
};
type SourceAccount = {
  currencyCode?: string;
  lease?: {
    currency?: string;
    lateFeeType?: string;
    lateFeeValue?: number | string;
    lateFeeGraceDays?: number;
    lateFeeMax?: number | string | null;
  };
  invoices?: SourceInvoice[];
};
const active = new Set(['pending', 'sent', 'partial', 'overdue']);
const money = (value: bigint) =>
  `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function argentinaCalendarDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
function dateOnly(value: string | Date) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const date = new Date(`${text}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  )
    throw new ConflictException(
      'Invalid historical invoice date requires review',
    );
  return { text, time: date.getTime() };
}
function billedAmounts(invoices: SourceInvoice[], currency: string) {
  const billed = new Map<string, bigint>();
  for (const invoice of invoices.filter(
    (i) => !['cancelled', 'refunded'].includes(i.status),
  )) {
    const fee = paymentCents(invoice.lateFee ?? 0);
    if (fee <= 0n) continue;
    if (invoice.currencyCode && currency && invoice.currencyCode !== currency)
      throw new ConflictException(
        'Late fee sources contain different currencies',
      );
    const evidence = invoice.lateFeeCalculation;
    if (
      evidence?.version !== 1 ||
      evidence.kind !== 'policy' ||
      !Array.isArray(evidence.sources)
    )
      throw new ConflictException(
        'Historical late fees require source reconciliation before automatic calculation',
      );
    if (
      evidence.sources.reduce(
        (sum, source) => sum + paymentCents(source.amount),
        0n,
      ) !== fee
    )
      throw new ConflictException(
        'Historical late fee evidence is incompatible',
      );
    for (const source of evidence.sources)
      billed.set(
        source.invoiceId,
        (billed.get(source.invoiceId) ?? 0n) + paymentCents(source.amount),
      );
  }
  return billed;
}
function accruedFee(
  type: string,
  value: bigint,
  pending: bigint,
  days: number,
): bigint {
  switch (type) {
    case LateFeeType.DAILY_PERCENTAGE:
      return (pending * value * BigInt(days) + 5000n) / 10000n;
    case LateFeeType.PERCENTAGE:
      return (pending * value + 5000n) / 10000n;
    case LateFeeType.DAILY_FIXED:
      return value * BigInt(days);
    case LateFeeType.FIXED:
      return value;
    default:
      throw new ConflictException(
        'Unsupported late fee policy requires review',
      );
  }
}
function maxDifference(value: bigint, previous: bigint): bigint {
  return value > previous ? value - previous : 0n;
}
function lateFeeSource(
  invoice: SourceInvoice,
  policy: LateFeeCalculation['policy'],
  previous: bigint,
  today: number,
  currency: string,
): LateFeeCalculation['sources'][number] | null {
  if (invoice.currencyCode && currency && invoice.currencyCode !== currency)
    throw new ConflictException(
      'Late fee sources contain different currencies',
    );
  const due = dateOnly(invoice.dueDate);
  const daysOverdue = Math.max(0, Math.round((today - due.time) / 86400000));
  const days = Math.max(0, daysOverdue - policy.graceDays);
  const base =
    paymentCents(invoice.total) -
    paymentCents(invoice.lateFee ?? 0) -
    paymentCents(invoice.amountPaid);
  if (days === 0 || base <= 0n) return null;
  const accrued = accruedFee(
    policy.type,
    paymentCents(policy.value),
    base,
    days,
  );
  return {
    invoiceId: invoice.id,
    dueDate: due.text,
    daysOverdue,
    chargeableDays: days,
    pendingAmount: money(base),
    accruedAmount: money(accrued),
    previouslyCharged: money(previous),
    amount: money(maxDifference(accrued, previous)),
  };
}
/** Declining unpaid principal, calendar days after grace, account-wide cap and already billed evidence. */
export function calculateLateFeeEvidence(
  account: SourceAccount | null,
  asOf = argentinaCalendarDay(),
): LateFeeCalculation {
  const lease = account?.lease;
  const currency = account?.currencyCode ?? lease?.currency ?? '';
  const type = lease?.lateFeeType ?? LateFeeType.NONE;
  const value = paymentCents(lease?.lateFeeValue ?? 0);
  const graceDays = lease?.lateFeeGraceDays ?? 0;
  const cap = lease?.lateFeeMax == null ? null : paymentCents(lease.lateFeeMax);
  if (!Number.isSafeInteger(graceDays) || graceDays < 0)
    throw new ConflictException('Invalid grace policy requires review');
  const result: LateFeeCalculation = {
    version: 1,
    kind: 'policy',
    asOf,
    timeZone: 'America/Argentina/Buenos_Aires',
    currency,
    policy: {
      type,
      value: money(value),
      graceDays,
      max: cap === null ? null : money(cap),
    },
    sources: [],
    amount: 0,
  };
  const today = dateOnly(asOf);
  if (!lease || type === LateFeeType.NONE || value === 0n) return result;
  const invoices = account?.invoices ?? [];
  const billed = billedAmounts(invoices, currency);
  const previouslyBilled = [...billed.values()].reduce(
    (sum, amount) => sum + amount,
    0n,
  );
  let remainingCap = cap === null ? null : maxDifference(cap, previouslyBilled);
  let total = 0n;
  for (const invoice of invoices
    .filter((i) => active.has(i.status))
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const source = lateFeeSource(
      invoice,
      result.policy,
      billed.get(invoice.id) ?? 0n,
      today.time,
      currency,
    );
    if (!source) continue;
    let amount = paymentCents(source.amount);
    if (remainingCap !== null) {
      amount = amount > remainingCap ? remainingCap : amount;
      remainingCap -= amount;
    }
    total += amount;
    result.sources.push({ ...source, amount: money(amount) });
  }
  result.amount = paymentNumber(total);
  paymentCents(result.amount);
  return result;
}
