import os from "node:os";
import { DataSource, EntityManager } from "typeorm";
import { AppDataSource } from "../../shared/database";
import { logger } from "../../shared/logger";
import { batchMetrics } from "../../shared/metrics";
import { RagBackfillService } from "./rag-backfill.service";
import {
  RAG_PROJECTION_BY_SOURCE,
  RAG_SOURCE_ENTITY_TYPES,
  RagSourceEntityType,
} from "./rag-types";

type OutboxStatus = "pending" | "processing" | "processed" | "failed";

interface ClaimedOutboxEvent {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string;
  operation: "upsert" | "delete";
  source_updated_at: Date;
  attempts: number;
  created_at: Date;
}

export interface RagOutboxRunResult {
  claimed: number;
  entities: number;
  processed: number;
  compacted: number;
  retried: number;
  failed: number;
  recovered: number;
  embedded: number;
  skipped: number;
  tokens: number;
}

export interface RagOutboxWorkerOptions {
  batchSize?: number;
  workerId?: string;
  maxAttempts?: number;
  lockTimeoutMs?: number;
  pollIntervalMs?: number;
  freshnessSlaSeconds?: number;
}

export class RagOutboxWorkerService {
  readonly workerId: string;
  private readonly dataSource: DataSource;
  private readonly sourceReader: RagBackfillService;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly lockTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly freshnessSlaSeconds: number;

  constructor(
    options: RagOutboxWorkerOptions & {
      dataSource?: DataSource;
      sourceReader?: RagBackfillService;
    } = {},
  ) {
    this.dataSource = options.dataSource ?? AppDataSource;
    this.sourceReader = options.sourceReader ?? new RagBackfillService();
    this.batchSize =
      options.batchSize ?? Number(process.env.AI_OUTBOX_BATCH_SIZE ?? 50);
    this.workerId =
      options.workerId ??
      process.env.AI_OUTBOX_WORKER_ID ??
      `${os.hostname()}:${process.pid}`;
    this.maxAttempts =
      options.maxAttempts ?? Number(process.env.AI_OUTBOX_MAX_ATTEMPTS ?? 8);
    this.lockTimeoutMs =
      options.lockTimeoutMs ??
      Number(process.env.AI_OUTBOX_LOCK_TIMEOUT_MS ?? 300_000);
    this.pollIntervalMs =
      options.pollIntervalMs ??
      Number(process.env.AI_OUTBOX_POLL_INTERVAL_MS ?? 5_000);
    this.freshnessSlaSeconds =
      options.freshnessSlaSeconds ??
      Number(process.env.AI_OUTBOX_FRESHNESS_SLA_SECONDS ?? 60);
    this.validateConfiguration();
  }

  async runOnce(): Promise<RagOutboxRunResult> {
    const result: RagOutboxRunResult = {
      claimed: 0,
      entities: 0,
      processed: 0,
      compacted: 0,
      retried: 0,
      failed: 0,
      recovered: 0,
      embedded: 0,
      skipped: 0,
      tokens: 0,
    };
    result.recovered = await this.recoverStaleLocks();
    const events = await this.claimEvents();
    result.claimed = events.length;
    const groups = this.compact(events);
    result.entities = groups.length;
    result.compacted = events.length - groups.length;

    for (const group of groups) {
      const latest = group[group.length - 1];
      try {
        const sync = await this.processEntity(latest);
        await this.markProcessed(group.map(({ id }) => id));
        result.processed += group.length;
        result.embedded += sync.embedded;
        result.tokens += sync.tokens;
        if (sync.skipped) result.skipped += 1;
        batchMetrics.recordOutboxRecords(
          latest.entity_type,
          "processed",
          group.length,
        );
        if (group.length > 1) {
          batchMetrics.recordOutboxRecords(
            latest.entity_type,
            "compacted",
            group.length - 1,
          );
        }
      } catch (error) {
        const failure = await this.markFailedOrRetry(group, error);
        result.retried += failure.retried;
        result.failed += failure.failed;
        batchMetrics.recordOutboxRecords(
          latest.entity_type,
          failure.failed > 0 ? "failed" : "retried",
          group.length,
        );
        logger.error("RAG outbox entity processing failed", {
          workerId: this.workerId,
          companyId: latest.company_id,
          entityType: latest.entity_type,
          entityId: latest.entity_id,
          attempts: latest.attempts,
          outcome: failure.failed > 0 ? "failed" : "retry",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.recordHealth();
    return result;
  }

  async runUntilStopped(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const result = await this.runOnce();
      if (result.claimed > 0 || result.recovered > 0) {
        logger.info("RAG outbox cycle completed", {
          workerId: this.workerId,
          ...result,
        });
      }
      if (signal.aborted) break;
      await this.wait(this.pollIntervalMs, signal);
    }
  }

  async recordHealth(): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT entity_type,
              count(*) FILTER (WHERE status = 'pending')::integer AS pending,
              count(*) FILTER (WHERE status = 'failed')::integer AS failed,
              COALESCE(EXTRACT(EPOCH FROM (NOW() - min(created_at)
                FILTER (WHERE status = 'pending'))), 0)::double precision AS lag_seconds
       FROM ai_embedding_outbox
       WHERE status IN ('pending', 'failed')
       GROUP BY entity_type`,
    )) as Array<{
      entity_type: string;
      pending: number;
      failed: number;
      lag_seconds: number;
    }>;
    await batchMetrics.setOutboxHealth(rows);
    const failed = rows.reduce((sum, row) => sum + Number(row.failed), 0);
    const lagSeconds = rows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.lag_seconds)),
      0,
    );
    if (failed > 0 || lagSeconds > this.freshnessSlaSeconds) {
      logger.warn("RAG outbox health threshold exceeded", {
        workerId: this.workerId,
        failed,
        lagSeconds,
        freshnessSlaSeconds: this.freshnessSlaSeconds,
      });
    }
  }

  private async claimEvents(): Promise<ClaimedOutboxEvent[]> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const result = await manager.query(
        `WITH candidates AS (
           SELECT id
           FROM ai_embedding_outbox
           WHERE status = 'pending' AND available_at <= NOW()
           ORDER BY available_at, created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE ai_embedding_outbox o
         SET status = 'processing',
             attempts = o.attempts + 1,
             locked_at = NOW(),
             locked_by = $2,
             last_error = NULL
         FROM candidates c
         WHERE o.id = c.id
         RETURNING o.id, o.company_id, o.entity_type, o.entity_id,
                   o.operation, o.source_updated_at, o.attempts, o.created_at`,
        [this.batchSize, this.workerId],
      );
      return this.mutationRows<ClaimedOutboxEvent>(result);
    });
  }

  private compact(events: ClaimedOutboxEvent[]): ClaimedOutboxEvent[][] {
    const groups = new Map<string, ClaimedOutboxEvent[]>();
    for (const event of events) {
      const key = `${event.company_id}:${event.entity_type}:${event.entity_id}`;
      const group = groups.get(key) ?? [];
      group.push(event);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) =>
      group.sort((left, right) => {
        const sourceDelta =
          new Date(left.source_updated_at).getTime() -
          new Date(right.source_updated_at).getTime();
        if (sourceDelta !== 0) return sourceDelta;
        return (
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime()
        );
      }),
    );
  }

  private async processEntity(event: ClaimedOutboxEvent): Promise<{
    embedded: number;
    tokens: number;
    skipped: boolean;
  }> {
    if (!RAG_SOURCE_ENTITY_TYPES.includes(event.entity_type as never)) {
      throw new Error(
        `Unsupported RAG outbox entity type: ${event.entity_type}`,
      );
    }
    const sourceType = event.entity_type as RagSourceEntityType;
    const source = await this.sourceReader.loadSourceEntity(
      sourceType,
      event.company_id,
      event.entity_id,
    );
    if (!source) {
      await this.softDeleteProjection(
        sourceType,
        event.company_id,
        event.entity_id,
      );
      return { embedded: 0, tokens: 0, skipped: false };
    }
    if (
      source.companyId !== event.company_id ||
      source.id !== event.entity_id
    ) {
      throw new Error("RAG outbox source scope mismatch");
    }
    return this.sourceReader.syncSourceEntity(source, {
      dryRun: false,
      force: false,
    });
  }

  private async softDeleteProjection(
    sourceType: RagSourceEntityType,
    companyId: string,
    entityId: string,
  ): Promise<void> {
    const projection = RAG_PROJECTION_BY_SOURCE[sourceType];
    await this.dataSource.query(
      `UPDATE ai_knowledge_chunks
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE company_id = $1
         AND entity_type = $2
         AND entity_id = $3
         AND deleted_at IS NULL`,
      [companyId, projection, entityId],
    );
  }

  private async markProcessed(ids: string[]): Promise<void> {
    await this.dataSource.query(
      `UPDATE ai_embedding_outbox
       SET status = 'processed', processed_at = NOW(),
           locked_at = NULL, locked_by = NULL, last_error = NULL
       WHERE id = ANY($1::uuid[])
         AND status = 'processing'
         AND locked_by = $2`,
      [ids, this.workerId],
    );
  }

  private async markFailedOrRetry(
    events: ClaimedOutboxEvent[],
    error: unknown,
  ): Promise<{ retried: number; failed: number }> {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 4_000);
    const queryResult = await this.dataSource.query(
      `UPDATE ai_embedding_outbox
       SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
           available_at = CASE
             WHEN attempts >= $3 THEN available_at
             ELSE NOW() + (LEAST(300000, 1000 * power(2, attempts - 1))::integer * INTERVAL '1 millisecond')
           END,
           locked_at = NULL,
           locked_by = NULL,
           last_error = $4
       WHERE id = ANY($1::uuid[])
         AND status = 'processing'
         AND locked_by = $2
      RETURNING status`,
      [events.map(({ id }) => id), this.workerId, this.maxAttempts, message],
    );
    const rows = this.mutationRows<{ status: OutboxStatus }>(queryResult);
    return {
      retried: rows.filter(({ status }) => status === "pending").length,
      failed: rows.filter(({ status }) => status === "failed").length,
    };
  }

  private async recoverStaleLocks(): Promise<number> {
    const queryResult = await this.dataSource.query(
      `UPDATE ai_embedding_outbox
       SET status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'pending' END,
           available_at = CASE WHEN attempts >= $2 THEN available_at ELSE NOW() END,
           locked_at = NULL,
           locked_by = NULL,
           last_error = CASE
             WHEN attempts >= $2 THEN 'Worker lock expired after maximum attempts'
             ELSE 'Worker lock expired and was recovered'
           END
       WHERE status = 'processing'
         AND locked_at < NOW() - ($1::integer * INTERVAL '1 millisecond')
      RETURNING entity_type, status`,
      [this.lockTimeoutMs, this.maxAttempts],
    );
    const rows = this.mutationRows<{
      entity_type: string;
      status: OutboxStatus;
    }>(queryResult);
    for (const row of rows) {
      batchMetrics.recordOutboxRecords(row.entity_type, "recovered", 1);
    }
    return rows.length;
  }

  private validateConfiguration(): void {
    for (const [name, value] of [
      ["AI_OUTBOX_BATCH_SIZE", this.batchSize],
      ["AI_OUTBOX_MAX_ATTEMPTS", this.maxAttempts],
      ["AI_OUTBOX_LOCK_TIMEOUT_MS", this.lockTimeoutMs],
      ["AI_OUTBOX_POLL_INTERVAL_MS", this.pollIntervalMs],
      ["AI_OUTBOX_FRESHNESS_SLA_SECONDS", this.freshnessSlaSeconds],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`);
      }
    }
  }

  private mutationRows<T>(result: unknown): T[] {
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === "number"
    ) {
      return result[0] as T[];
    }
    return result as T[];
  }

  private async wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
