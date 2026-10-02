import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { createHmac } from 'node:crypto';
import { assertApprovedMutationReview } from './mutation-review';

// Authorization codes on a financial receipt are business evidence, not bearer credentials.
function isCredential(name: string): boolean {
  return (
    /password|secret|token|private[-_]?key/i.test(name) ||
    name.toLowerCase() === 'authorization'
  );
}

function withoutCredentials<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutCredentials) as T;
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  )
    return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name]) => !isCredential(name))
      .map(([name, item]) => [name, withoutCredentials(item)]),
  ) as T;
}

/** The callback must use this transaction for every write and enqueue external effects. */
export async function withDomainOperationReceipt<T>(
  manager: EntityManager,
  companyId: string,
  executionKey: string | undefined,
  operation: string,
  request: Record<string, unknown>,
  execute: () => Promise<T>,
): Promise<T> {
  if (!executionKey) return execute();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      executionKey,
    )
  )
    throw new BadRequestException('Execution key must be a UUID');
  if (!companyId || !manager.queryRunner?.isTransactionActive)
    throw new BadRequestException(
      'Operation receipt requires a company transaction',
    );
  const key = executionKey.toLowerCase();
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `domain-operation:${companyId}:${key}`,
  ]);
  const payload = JSON.stringify(request, (name, value: unknown) => {
    if (!isCredential(name)) return value;
    if (!process.env.JWT_SECRET)
      throw new BadRequestException(
        'A runtime secret is required to fingerprint sensitive requests',
      );
    return {
      fingerprint: createHmac('sha256', process.env.JWT_SECRET)
        .update(JSON.stringify(value) ?? 'null')
        .digest('hex'),
    };
  });
  const [receipt] = await manager.query(
    `SELECT result, (operation=$3 AND request=$4::jsonb) AS matches
       FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2::uuid`,
    [companyId, key, operation, payload],
  );
  if (receipt) {
    if (!receipt.matches)
      throw new ConflictException(
        'Execution key was already used for a different operation or request',
      );
    return receipt.result as T;
  }
  await assertApprovedMutationReview(manager, companyId, key);
  const result = withoutCredentials(await execute());
  await manager.query(
    `INSERT INTO domain_operation_receipts(company_id,execution_key,operation,request,result)
     VALUES($1,$2::uuid,$3,$4::jsonb,$5::jsonb)`,
    [
      companyId,
      key,
      operation,
      payload,
      JSON.stringify(result ?? null, (name, value: unknown) =>
        isCredential(name) ? undefined : value,
      ),
    ],
  );
  return result;
}
