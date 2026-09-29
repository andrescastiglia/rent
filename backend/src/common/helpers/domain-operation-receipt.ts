import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

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
  if (!companyId || !manager.queryRunner?.isTransactionActive)
    throw new BadRequestException(
      'Operation receipt requires a company transaction',
    );
  const key = executionKey.toLowerCase();
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `domain-operation:${companyId}:${key}`,
  ]);
  const payload = JSON.stringify(request);
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
  const result = await execute();
  await manager.query(
    `INSERT INTO domain_operation_receipts(company_id,execution_key,operation,request,result)
     VALUES($1,$2::uuid,$3,$4::jsonb,$5::jsonb)`,
    [companyId, key, operation, payload, JSON.stringify(result ?? null)],
  );
  return result;
}
