import os from "node:os";
import {
  Counter,
  Gauge,
  Histogram,
  Pushgateway,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

type JobStatus = "success" | "failed";

type JobSummary = {
  recordsTotal?: number;
  recordsProcessed?: number;
  recordsFailed?: number;
};

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
