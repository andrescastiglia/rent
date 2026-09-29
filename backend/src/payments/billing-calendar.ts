import { BadRequestException } from '@nestjs/common';
import { Lease } from '../leases/entities/lease.entity';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

function calendarDate(value: string | Date): Date {
  const day = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const date = new Date(`${day}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new BadRequestException(
      'Billing dates must be valid YYYY-MM-DD dates',
    );
  return date;
}

export function addCalendarMonths(value: Date, months: number): Date {
  const result = calendarDate(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

export function addCalendarDays(value: Date, days: number): Date {
  const result = calendarDate(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function advanceBillingCalendar(
  lease: Lease,
  periodStart: Date,
  periodEnd: Date,
) {
  if (!lease.lastBillingDate || periodStart > new Date(lease.lastBillingDate))
    lease.lastBillingDate = periodStart;
  const nextBillingDate = addCalendarDays(periodEnd, 1);
  if (
    !lease.nextBillingDate ||
    nextBillingDate > new Date(lease.nextBillingDate)
  )
    lease.nextBillingDate = nextBillingDate;
}

export function computeBillingPeriod(lease: Lease, dto: GenerateInvoiceDto) {
  const custom = [dto.periodStart, dto.periodEnd, dto.dueDate];
  if (custom.some((value) => value !== undefined)) {
    if (!custom.every((value) => value !== undefined))
      throw new BadRequestException(
        'Custom billing requires periodStart, periodEnd and dueDate',
      );
    const periodStart = calendarDate(dto.periodStart!),
      periodEnd = calendarDate(dto.periodEnd!),
      dueDate = calendarDate(dto.dueDate!);
    if (periodEnd < periodStart)
      throw new BadRequestException(
        'Billing period end must not precede its start',
      );
    return { periodStart, periodEnd, dueDate };
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const periodStart = calendarDate(
    lease.nextBillingDate || `${today.slice(0, 7)}-01`,
  );
  const frequencies: Record<string, number> = {
    monthly: 1,
    bimonthly: 2,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
  };
  const months = frequencies[lease.paymentFrequency || 'monthly'];
  if (!months) throw new BadRequestException('Unsupported billing frequency');
  const periodEnd = addCalendarDays(addCalendarMonths(periodStart, months), -1);
  const day = lease.paymentDueDay || 10;
  if (!Number.isInteger(day) || day < 1 || day > 31)
    throw new BadRequestException('Invalid billing due day');
  const dueInMonth = (start: Date) => {
    const result = new Date(start);
    const last = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, last));
    return result;
  };
  let dueDate = dueInMonth(periodStart);
  if (dueDate < periodStart)
    dueDate = dueInMonth(addCalendarMonths(periodStart, 1));
  return { periodStart, periodEnd, dueDate };
}
