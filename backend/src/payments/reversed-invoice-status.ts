import { BadRequestException } from '@nestjs/common';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { paymentCents } from './payment-amount';

export function reversedInvoiceStatus(
  invoice: Pick<Invoice, 'status' | 'total' | 'dueDate'>,
  remainingPaid: bigint,
  previousUnpaidStatus: InvoiceStatus,
  now = new Date(),
): InvoiceStatus {
  if (
    [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED].includes(invoice.status)
  )
    return invoice.status;
  if (remainingPaid > 0n)
    return remainingPaid >= paymentCents(invoice.total)
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIAL;
  const dueDate =
    invoice.dueDate instanceof Date
      ? invoice.dueDate.toISOString().slice(0, 10)
      : String(invoice.dueDate);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !Number.isFinite(new Date(`${dueDate}T12:00:00Z`).getTime()) ||
    new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0, 10) !== dueDate
  )
    throw new BadRequestException(
      'Invoice due date requires review before reversal',
    );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (dueDate < today) return InvoiceStatus.OVERDUE;
  return previousUnpaidStatus === InvoiceStatus.SENT
    ? InvoiceStatus.SENT
    : InvoiceStatus.PENDING;
}
