import { createHash } from 'node:crypto';

// $1 is the requested calendar day. Both selection and the locked recheck use this predicate.
export const SCHEDULED_BILLING_ELIGIBILITY = `l.status='active' AND l.contract_type='rental'
  AND l.deleted_at IS NULL AND l.start_date <= $1::date AND l.end_date >= $1::date
  AND (l.next_billing_date IS NULL OR l.next_billing_date <= $1::date)
  AND LEAST(CASE l.billing_frequency
    WHEN 'last_of_month' THEN 31 WHEN 'contract_date' THEN EXTRACT(DAY FROM l.start_date)
    WHEN 'custom' THEN COALESCE(l.billing_day,1) ELSE 1 END,
    EXTRACT(DAY FROM date_trunc('month',$1::date) + INTERVAL '1 month - 1 day')) <= EXTRACT(DAY FROM $1::date)`;

export function scheduledBillingKey(
  companyId: string,
  leaseId: string,
  billingDate: string,
): string {
  const bytes = createHash('sha256')
    .update(`rent:scheduled-invoice:v1:${companyId}:${leaseId}:${billingDate}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
