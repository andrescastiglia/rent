import { BadRequestException } from '@nestjs/common';
import { PaymentItemType } from './entities/payment-item.entity';

const MAX_PAYMENT_CENTS = 99999999999999n;
const MAX_ITEM_CENTS = 999999999999n;

export function paymentCents(
  value: unknown,
  label = 'Amount',
  max = MAX_PAYMENT_CENTS,
): bigint {
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new BadRequestException(`${label} must be a monetary amount`);
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw new BadRequestException(
      `${label} must have at most two decimal places`,
    );
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > max)
    throw new BadRequestException(`${label} exceeds the supported amount`);
  return cents;
}

export function paymentNumber(cents: bigint): number {
  return Number(cents) / 100;
}

type PaymentAmounts = {
  amount?: unknown;
  items?: Array<{ amount: unknown; quantity?: number; type?: PaymentItemType }>;
};

export function calculatePaymentAmount(dto: PaymentAmounts): number {
  const stated =
    dto.amount === undefined || dto.amount === null
      ? undefined
      : paymentCents(dto.amount);
  let total = stated;
  if (dto.items?.length) {
    total = dto.items.reduce((sum, item) => {
      const quantity = item.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647)
        throw new BadRequestException(
          'Item quantity must be a positive supported integer',
        );
      if (
        item.type !== undefined &&
        !Object.values(PaymentItemType).includes(item.type)
      )
        throw new BadRequestException('Invalid payment item type');
      const value =
        paymentCents(item.amount, 'Item amount', MAX_ITEM_CENTS) *
        BigInt(quantity);
      return sum + (item.type === PaymentItemType.DISCOUNT ? -value : value);
    }, 0n);
    if (stated !== undefined && stated !== total)
      throw new BadRequestException('Amount does not match items total');
  }
  if (total === undefined)
    throw new BadRequestException('Amount is required without items');
  if (total <= 0n)
    throw new BadRequestException('Total amount must be greater than zero');
  if (total > MAX_PAYMENT_CENTS)
    throw new BadRequestException('Total amount exceeds the supported amount');
  return paymentNumber(total);
}
