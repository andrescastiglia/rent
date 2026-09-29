import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Allocate in the same transaction that persists the document and accounting. */
export async function allocatePaymentDocumentNumber(
  manager: EntityManager | undefined,
  kind: 'receipt' | 'credit_note',
): Promise<string> {
  if (!manager?.queryRunner?.isTransactionActive)
    throw new BadRequestException(
      'Document numbering requires an active transaction',
    );
  const [result] = await manager.query(
    'SELECT next_payment_document_number($1) AS number',
    [kind],
  );
  if (typeof result?.number !== 'string' || !result.number)
    throw new Error('Payment document number is unavailable');
  return result.number;
}
