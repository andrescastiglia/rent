import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

type DocumentEffectsStream =
  'payment' | 'sale_receipt' | 'settlement_payout' | 'lease_contract';
const STREAMS = {
  lease_contract: {
    table: 'lease_contract_effects_outbox',
    column: 'lease_id',
  },
  settlement_payout: {
    table: 'settlement_payout_effects_outbox',
    column: 'movement_id',
  },
  payment: { table: 'payment_effects_outbox', column: 'payment_id' },
  sale_receipt: { table: 'sale_receipt_effects_outbox', column: 'receipt_id' },
} as const;

/** Local PDF persistence and delivery enqueueing only; never call a provider here. */
export async function processDocumentEffects(
  dataSource: DataSource,
  stream: DocumentEffectsStream,
  logger: Logger,
  render: (
    manager: EntityManager,
    entityId: string,
    companyId: string,
  ) => Promise<void>,
) {
  const { table, column } = STREAMS[stream];
  const counts = { processed: 0, completed: 0, failed: 0 };
  for (let index = 0; index < 25; index++) {
    const outcome = await dataSource.transaction(async (manager) => {
      const rows: {
        id: string;
        company_id: string;
        entity_id: string;
        attempts: number;
      }[] = await manager.query(
        `SELECT id, company_id, ${column} AS entity_id, attempts FROM ${table}
         WHERE status = 'queued' AND next_attempt_at <= NOW()
         ORDER BY next_attempt_at, created_at
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const event = rows[0];
      if (!event) return null;
      // Retain the claim lock while rolling back incomplete rendering.
      await manager.query('SAVEPOINT document_effects');
      try {
        await render(manager, event.entity_id, event.company_id);
        await manager.query(
          `UPDATE ${table} SET status = 'completed', attempts = attempts + 1,
           completed_at = NOW(), error_code = NULL WHERE id = $1::uuid`,
          [event.id],
        );
        return 'completed' as const;
      } catch {
        await manager.query('ROLLBACK TO SAVEPOINT document_effects');
        await manager.query(
          `UPDATE ${table} SET attempts = attempts + 1,
           status = CASE WHEN attempts + 1 >= 5 THEN 'dead_letter' ELSE 'queued' END,
           next_attempt_at = NOW() + (LEAST(3600, 30 * power(2, attempts)) * INTERVAL '1 second'),
           error_code = 'render_or_enqueue_failed' WHERE id = $1::uuid`,
          [event.id],
        );
        logger.warn(
          JSON.stringify({
            event: `${stream}_effects_failed`,
            id: event.id,
            attempt: event.attempts + 1,
          }),
        );
        return 'failed' as const;
      }
    });
    if (!outcome) break;
    counts.processed++;
    counts[outcome]++;
  }
  const [queue] = await dataSource.query(
    `SELECT count(*) FILTER (WHERE status = 'queued')::integer AS queued,
            count(*) FILTER (WHERE status = 'dead_letter')::integer AS "deadLetter"
     FROM ${table}`,
  );
  logger.log(
    JSON.stringify({
      event: `${stream}_effects_processed`,
      ...counts,
      ...queue,
    }),
  );
  return { ...counts, ...queue };
}
