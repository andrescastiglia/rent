import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AdjustmentType, Lease } from '../leases/entities/lease.entity';
import { addCalendarMonths } from './billing-calendar';

export interface RentObservation {
  id: string;
  date: string;
  value: string;
  revision: number;
  value_kind: string;
  source: string;
  source_series: string;
  source_url: string;
  retrieved_at: string;
}
export interface RentCalculation {
  version: 1;
  asOf: string;
  currency: string;
  initialRent: string;
  finalRent: string;
  applied: boolean;
  adjustments: Array<{
    baseDate: string;
    effectiveDate: string;
    previousRent: string;
    newRent: string;
    type: string;
    index: string | null;
    lagMonths: number | null;
    frequencyMonths: number;
    scheduleAnchor: string;
    numerator: string;
    denominator: string;
    observations: RentObservation[];
  }>;
}
const SCALE = 10000000000n;
const MAX_CENTS = 999999999999n;

function day(value: Date | string | null | undefined): string {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const date = new Date(`${text}T12:00:00Z`);
  if (
    !text ||
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  )
    throw new BadRequestException('Valid rent adjustment dates are required');
  return text;
}
function decimal(value: unknown, scale: number): bigint {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text))
    throw new BadRequestException('Invalid rent adjustment value');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale)))
    throw new BadRequestException('Unsupported rent adjustment precision');
  return (
    (text.startsWith('-') ? -1n : 1n) *
    BigInt(whole + fraction.slice(0, scale).padEnd(scale, '0'))
  );
}
function money(cents: bigint): string {
  if (cents < 0n || cents > MAX_CENTS)
    throw new BadRequestException(
      'Adjusted rent is outside the supported range',
    );
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
function rounded(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n)
    throw new BadRequestException('Invalid rent adjustment factor');
  return (2n * numerator + denominator) / (2n * denominator);
}
function month(value: string, lag: number): string {
  return day(
    addCalendarMonths(new Date(`${value.slice(0, 7)}-01T12:00:00Z`), -lag),
  );
}
function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

/** Uses only persisted observations and runs inside the invoice's locked transaction. */
export async function calculateRentAdjustment(
  manager: EntityManager,
  lease: Lease,
  periodStart: Date,
  apply: boolean,
) {
  const asOf = day(periodStart);
  let cents = decimal(lease.monthlyRent, 2);
  const snapshot: RentCalculation = {
    version: 1,
    asOf,
    currency: lease.currency,
    initialRent: money(cents),
    finalRent: money(cents),
    applied: apply,
    adjustments: [],
  };
  let lastDate = lease.lastAdjustmentDate
    ? day(lease.lastAdjustmentDate)
    : null;
  if (lastDate && asOf < lastDate)
    throw new BadRequestException(
      'Billing before the last rent adjustment requires historical rent review',
    );
  const unchanged = {
    rent: Number(snapshot.finalRent),
    snapshot,
    lastDate,
    nextDate: lease.nextAdjustmentDate ? day(lease.nextAdjustmentDate) : null,
    anchor: lease.adjustmentAnchorDate ? day(lease.adjustmentAnchorDate) : null,
  };
  if (
    !apply ||
    !lease.nextAdjustmentDate ||
    asOf < day(lease.nextAdjustmentDate)
  )
    return unchanged;
  const frequency = lease.adjustmentFrequencyMonths ?? 12;
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 120)
    throw new BadRequestException(
      'Adjustment frequency must be between 1 and 120 whole months',
    );
  let base = lastDate ?? day(lease.startDate);
  const first = day(lease.nextAdjustmentDate);
  if (first <= base)
    throw new BadRequestException(
      'Next rent adjustment must follow its base date',
    );
  const anchor = lease.adjustmentAnchorDate
    ? day(lease.adjustmentAnchorDate)
    : first;
  const anchorDate = new Date(`${anchor}T12:00:00Z`),
    firstDate = new Date(`${first}T12:00:00Z`);
  const offset =
    (firstDate.getUTCFullYear() - anchorDate.getUTCFullYear()) * 12 +
    firstDate.getUTCMonth() -
    anchorDate.getUTCMonth();
  if (
    offset < 0 ||
    offset % frequency !== 0 ||
    day(addCalendarMonths(anchorDate, offset)) !== first
  )
    throw new BadRequestException(
      'Rent adjustment schedule changed; review its anchor date',
    );
  const dates: string[] = [];
  let nextDate = first;
  while (nextDate <= asOf) {
    if (dates.length >= 600)
      throw new BadRequestException('Rent adjustment backlog requires review');
    dates.push(nextDate);
    nextDate = day(
      addCalendarMonths(anchorDate, offset + dates.length * frequency),
    );
  }
  const indexed = lease.adjustmentType === AdjustmentType.INFLATION_INDEX;
  const index = indexed ? lease.inflationIndexType : null;
  if (indexed && !['icl', 'ipc', 'igp_m'].includes(index ?? ''))
    throw new BadRequestException('Rent adjustment index is required');
  const lag = indexed && index !== 'icl' ? lease.inflationIndexLagMonths : null;
  if (
    indexed &&
    index !== 'icl' &&
    (lag == null || !Number.isInteger(lag) || lag < 0 || lag > 12)
  )
    throw new BadRequestException(
      'Monthly index lag must be explicitly set between 0 and 12 months',
    );
  const reference = (date: string) =>
    index === 'icl' ? date : month(date, lag!);
  const observations: RentObservation[] = indexed
    ? await manager.query(
        `SELECT DISTINCT ON (observation_date) id,observation_date::text AS date,value::text,revision,value_kind,
      source,source_series,source_url,retrieved_at::text
     FROM inflation_observations WHERE index_type=$1 AND observation_date BETWEEN $2::date AND $3::date
     ORDER BY observation_date,revision DESC`,
        [index, reference(base), reference(dates[dates.length - 1])],
      )
    : [];
  const byDate = new Map(observations.map((row) => [row.date, row]));
  const observation = (date: string) => {
    const row = byDate.get(date);
    if (
      !row ||
      row.value_kind !== (index === 'igp_m' ? 'monthly_percent' : 'level')
    )
      throw new BadRequestException(
        `Inflation observation unavailable: ${index} ${date}`,
      );
    return row;
  };
  for (const effective of dates) {
    const previous = cents;
    let numerator = 1n,
      denominator = 1n;
    const used: RentObservation[] = [];
    if (indexed) {
      const from = reference(base),
        to = reference(effective);
      if (to <= from)
        throw new BadRequestException('Index reference periods must advance');
      if (index === 'igp_m') {
        for (
          let current = day(
            addCalendarMonths(new Date(`${from}T12:00:00Z`), 1),
          );
          current <= to;
          current = day(addCalendarMonths(new Date(`${current}T12:00:00Z`), 1))
        ) {
          const row = observation(current),
            factor = 100n * SCALE + decimal(row.value, 10);
          if (factor <= 0n)
            throw new BadRequestException(
              'Invalid monthly inflation percentage',
            );
          used.push(row);
          numerator *= factor;
          denominator *= 100n * SCALE;
          const divisor = gcd(numerator, denominator);
          numerator /= divisor;
          denominator /= divisor;
        }
      } else {
        const initial = observation(from),
          final = observation(to);
        numerator = decimal(final.value, 10);
        denominator = decimal(initial.value, 10);
        if (numerator <= 0n || denominator <= 0n)
          throw new BadRequestException('Invalid inflation index level');
        used.push(initial, final);
      }
      cents = rounded(previous * numerator, denominator);
    } else if (lease.adjustmentType === AdjustmentType.PERCENTAGE) {
      numerator = 1000000n + decimal(lease.adjustmentValue ?? 0, 4);
      denominator = 1000000n;
      cents = rounded(previous * numerator, denominator);
    } else if (lease.adjustmentType === AdjustmentType.FIXED) {
      cents += decimal(lease.adjustmentValue ?? 0, 2);
      // Fixed adjustment evidence represents the exact additive amount, not a ratio.
      numerator = decimal(lease.adjustmentValue ?? 0, 2);
      denominator = 100n;
    } else throw new BadRequestException('Unsupported rent adjustment type');
    snapshot.adjustments.push({
      baseDate: base,
      effectiveDate: effective,
      previousRent: money(previous),
      newRent: money(cents),
      type: lease.adjustmentType,
      index: index ?? null,
      lagMonths: lag ?? null,
      frequencyMonths: frequency,
      scheduleAnchor: anchor,
      numerator: numerator.toString(),
      denominator: denominator.toString(),
      observations: used,
    });
    base = effective;
    lastDate = effective;
  }
  snapshot.finalRent = money(cents);
  return {
    rent: Number(snapshot.finalRent),
    snapshot,
    lastDate,
    nextDate,
    anchor,
  };
}
