import os from "node:os";
import {
  Counter,
  Gauge,
  Histogram,
  Pushgateway,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import { RAG_SOURCE_ENTITY_TYPES } from "../services/rag/rag-types";

type JobStatus = "success" | "failed";

type JobSummary = {
  recordsTotal?: number;
  recordsProcessed?: number;
  recordsFailed?: number;
};

type OutboxOutcome =
  "processed" | "compacted" | "retried" | "failed" | "recovered";

class BatchMetrics {
  private readonly registry = new Registry();
  private readonly pushGatewayUrl =
    process.env.PROMETHEUS_PUSHGATEWAY_URL?.trim() || "";
  private readonly pushGatewayJob =
    process.env.PROMETHEUS_PUSHGATEWAY_JOB?.trim() || "rent_batch";
  private readonly instance =
    process.env.PROMETHEUS_PUSHGATEWAY_INSTANCE?.trim() || os.hostname();
  private readonly pushGateway = this.pushGatewayUrl
    ? new Pushgateway(this.pushGatewayUrl, {}, this.registry)
    : null;

  private readonly jobRunsTotal = new Counter({
    name: "batch_job_runs_total",
    help: "Total number of executed batch jobs",
    labelNames: ["job", "status"] as const,
    registers: [this.registry],
  });

  private readonly jobDurationSeconds = new Histogram({
    name: "batch_job_duration_seconds",
    help: "Batch job execution duration in seconds",
    labelNames: ["job", "status"] as const,
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 900, 1800],
    registers: [this.registry],
  });

  private readonly recordsTotal = new Counter({
    name: "batch_records_total",
    help: "Total number of records considered by batch jobs",
    labelNames: ["job"] as const,
    registers: [this.registry],
  });

  private readonly recordsProcessedTotal = new Counter({
    name: "batch_records_processed_total",
    help: "Total number of records successfully processed by batch jobs",
    labelNames: ["job"] as const,
    registers: [this.registry],
  });

  private readonly recordsFailedTotal = new Counter({
    name: "batch_records_failed_total",
    help: "Total number of records failed by batch jobs",
    labelNames: ["job"] as const,
    registers: [this.registry],
  });

  private readonly lastSuccessTimestampSeconds = new Gauge({
    name: "batch_last_success_timestamp_seconds",
    help: "Unix timestamp of the latest successful batch job execution",
    labelNames: ["job"] as const,
    registers: [this.registry],
  });

  private readonly embeddingRequestsTotal = new Counter({
    name: "ai_embedding_requests_total",
    help: "Total OpenAI embedding API attempts",
    labelNames: ["model", "outcome"] as const,
    registers: [this.registry],
  });

  private readonly embeddingTokensTotal = new Counter({
    name: "ai_embedding_tokens_total",
    help: "Total input tokens consumed by embedding requests",
    labelNames: ["model"] as const,
    registers: [this.registry],
  });

  private readonly embeddingRequestDurationSeconds = new Histogram({
    name: "ai_embedding_request_duration_seconds",
    help: "OpenAI embedding API request duration in seconds",
    labelNames: ["model", "outcome"] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [this.registry],
  });

  private readonly outboxRecordsTotal = new Counter({
    name: "ai_embedding_backfill_records_total",
    help: "RAG outbox records by entity type and processing outcome",
    labelNames: ["entity_type", "outcome"] as const,
    registers: [this.registry],
  });

  private readonly outboxPending = new Gauge({
    name: "ai_embedding_outbox_pending",
    help: "Current pending RAG outbox records",
    labelNames: ["entity_type"] as const,
    registers: [this.registry],
  });

  private readonly outboxFailed = new Gauge({
    name: "ai_embedding_outbox_failed",
    help: "Current failed RAG outbox records",
    labelNames: ["entity_type"] as const,
    registers: [this.registry],
  });

  private readonly outboxLagSeconds = new Gauge({
    name: "ai_embedding_lag_seconds",
    help: "Age in seconds of the oldest pending RAG outbox record",
    labelNames: ["entity_type"] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "batch_",
    });
  }

  async recordJobRun(input: {
    job: string;
    status: JobStatus;
    startedAtNs: bigint;
    summary?: JobSummary;
  }): Promise<void> {
    const job = input.job;
    const status = input.status;
    const elapsedNs = process.hrtime.bigint() - input.startedAtNs;
    const durationSeconds = Number(elapsedNs) / 1_000_000_000;

    this.jobRunsTotal.inc({ job, status });
    this.jobDurationSeconds.observe({ job, status }, durationSeconds);

    if (input.summary?.recordsTotal && input.summary.recordsTotal > 0) {
      this.recordsTotal.inc({ job }, input.summary.recordsTotal);
    }
    if (input.summary?.recordsProcessed && input.summary.recordsProcessed > 0) {
      this.recordsProcessedTotal.inc({ job }, input.summary.recordsProcessed);
    }
    if (input.summary?.recordsFailed && input.summary.recordsFailed > 0) {
      this.recordsFailedTotal.inc({ job }, input.summary.recordsFailed);
    }

    if (status === "success") {
      this.lastSuccessTimestampSeconds.set({ job }, Date.now() / 1000);
    }

    await this.push(job);
  }

  recordEmbeddingRequest(input: {
    model: string;
    outcome: "success" | "error";
    durationMs: number;
    tokens?: number;
  }): void {
    this.embeddingRequestsTotal.inc({
      model: input.model,
      outcome: input.outcome,
    });
    this.embeddingRequestDurationSeconds.observe(
      { model: input.model, outcome: input.outcome },
      input.durationMs / 1_000,
    );
    if (input.tokens && input.tokens > 0) {
      this.embeddingTokensTotal.inc({ model: input.model }, input.tokens);
    }
  }

  recordOutboxRecords(
    entityType: string,
    outcome: OutboxOutcome,
    count: number,
  ): void {
    if (count > 0) {
      this.outboxRecordsTotal.inc({ entity_type: entityType, outcome }, count);
    }
  }

  async setOutboxHealth(
    rows: Array<{
      entity_type: string;
      pending: number;
      failed: number;
      lag_seconds: number;
    }>,
  ): Promise<void> {
    const byType = new Map(rows.map((row) => [row.entity_type, row]));
    for (const entityType of RAG_SOURCE_ENTITY_TYPES) {
      const row = byType.get(entityType);
      this.outboxPending.set(
        { entity_type: entityType },
        Number(row?.pending ?? 0),
      );
      this.outboxFailed.set(
        { entity_type: entityType },
        Number(row?.failed ?? 0),
      );
      this.outboxLagSeconds.set(
        { entity_type: entityType },
        Number(row?.lag_seconds ?? 0),
      );
    }
    await this.push("rag-sync");
  }

  private async push(command: string): Promise<void> {
    if (!this.pushGateway) {
      return;
    }

    try {
      await this.pushGateway.pushAdd({
        jobName: this.pushGatewayJob,
        groupings: {
          instance: this.instance,
          command,
        },
      });
    } catch {
      // Metrics push failures must not fail the batch job.
    }
  }
}

export const batchMetrics = new BatchMetrics();
