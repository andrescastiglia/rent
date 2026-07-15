import { Command } from "commander";
import { closeDatabase, initializeDatabase } from "../../shared/database";
import { logger } from "../../shared/logger";
import { batchMetrics } from "../../shared/metrics";
import { RagBackfillService } from "./rag-backfill.service";
import { RagOutboxWorkerService } from "./rag-outbox-worker.service";
import { RagVerificationService } from "./rag-verification.service";
import { RagCliEntityType } from "./rag-types";

const parsePositiveInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
};

const parseEntity = (value: string): RagCliEntityType => {
  if (value === "property" || value === "document" || value === "all") {
    return value;
  }
  throw new Error("entity must be property, document or all");
};

const withDatabase = async (action: () => Promise<void>): Promise<void> => {
  try {
    await initializeDatabase();
    await action();
  } finally {
    await closeDatabase();
  }
};

export const registerRagCommands = (program: Command): void => {
  program
    .command("rag-sync")
    .description("Process the transactional RAG embedding outbox")
    .option("--log <file>", "Write logs to the given file")
    .option("--once", "Process one available batch and exit", false)
    .option("--batch-size <number>", "Maximum outbox records per cycle", "50")
    .option("--worker-id <id>", "Stable worker identifier")
    .option(
      "--poll-interval <milliseconds>",
      "Continuous polling interval",
      "5000",
    )
    .action(async (options) => {
      const startedAtNs = process.hrtime.bigint();
      await withDatabase(async () => {
        const worker = new RagOutboxWorkerService({
          batchSize: parsePositiveInteger(options.batchSize, "batch-size"),
          workerId: options.workerId,
          pollIntervalMs: parsePositiveInteger(
            options.pollInterval,
            "poll-interval",
          ),
        });
        if (options.once) {
          const result = await worker.runOnce();
          logger.info("RAG outbox synchronization completed", {
            workerId: worker.workerId,
            ...result,
          });
          await batchMetrics.recordJobRun({
            job: "rag-sync",
            status: result.failed > 0 ? "failed" : "success",
            startedAtNs,
            summary: {
              recordsTotal: result.claimed,
              recordsProcessed: result.processed,
              recordsFailed: result.failed,
            },
          });
          if (result.failed > 0) process.exitCode = 1;
          return;
        }

        const controller = new AbortController();
        const stop = () => controller.abort();
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        logger.info("RAG outbox worker started", {
          workerId: worker.workerId,
          batchSize: options.batchSize,
        });
        try {
          await worker.runUntilStopped(controller.signal);
        } finally {
          process.removeListener("SIGINT", stop);
          process.removeListener("SIGTERM", stop);
        }
      });
    });

  program
    .command("rag-reconcile")
    .description("Run the nightly incremental RAG reconciliation")
    .option("--log <file>", "Write logs to the given file")
    .option("--entity <type>", "property, document or all", "all")
    .option("--company-id <uuid>", "Restrict reconciliation to one company")
    .option("--batch-size <number>", "Source entities per page", "50")
    .option("--concurrency <number>", "Concurrent source entities", "2")
    .option("--sample-size <number>", "Verification sample per type", "1000")
    .action(async (options) => {
      const startedAtNs = process.hrtime.bigint();
      await withDatabase(async () => {
        const entity = parseEntity(options.entity);
        const backfill = await new RagBackfillService().run({
          entity,
          companyId: options.companyId,
          batchSize: parsePositiveInteger(options.batchSize, "batch-size"),
          concurrency: parsePositiveInteger(options.concurrency, "concurrency"),
          dryRun: false,
          force: false,
        });
        const verification = await new RagVerificationService().verify({
          entity,
          companyId: options.companyId,
          sampleSize: parsePositiveInteger(options.sampleSize, "sample-size"),
        });
        const issues =
          verification.missing +
          verification.stale +
          verification.invalidDimensions +
          verification.orphaned +
          verification.selfSearchFailures;
        logger.info("RAG reconciliation completed", {
          backfill,
          verification,
        });
        await batchMetrics.recordJobRun({
          job: "rag-reconcile",
          status: backfill.failed + issues > 0 ? "failed" : "success",
          startedAtNs,
          summary: {
            recordsTotal: backfill.processed,
            recordsProcessed: backfill.processed - backfill.failed,
            recordsFailed: backfill.failed + issues,
          },
        });
        if (backfill.failed + issues > 0) process.exitCode = 1;
      });
    });

  program
    .command("rag-backfill")
    .description("Backfill canonical RAG chunks and embeddings")
    .option("--log <file>", "Write logs to the given file")
    .option("--entity <type>", "property, document or all", "all")
    .option("--company-id <uuid>", "Restrict the backfill to one company")
    .option("--batch-size <number>", "Source entities per page", "50")
    .option("--checkpoint <uuid>", "Resume after this source entity ID")
    .option("--concurrency <number>", "Concurrent source entities", "2")
    .option(
      "--dry-run",
      "Build and compare chunks without writes or API calls",
      false,
    )
    .option("--force", "Regenerate embeddings even when hashes match", false)
    .action(async (options) => {
      await withDatabase(async () => {
        const service = new RagBackfillService({ dryRun: options.dryRun });
        const result = await service.run({
          entity: parseEntity(options.entity),
          companyId: options.companyId,
          batchSize: parsePositiveInteger(options.batchSize, "batch-size"),
          checkpoint: options.checkpoint,
          concurrency: parsePositiveInteger(options.concurrency, "concurrency"),
          dryRun: options.dryRun,
          force: options.force,
        });
        logger.info("RAG backfill completed", result);
        if (result.failed > 0) process.exitCode = 1;
      });
    });

  program
    .command("rag-verify")
    .description("Verify RAG coverage, hashes, dimensions and source freshness")
    .option("--log <file>", "Write logs to the given file")
    .option("--entity <type>", "property, document or all", "all")
    .option("--company-id <uuid>", "Restrict verification to one company")
    .option("--sample-size <number>", "Maximum source entities per type", "100")
    .action(async (options) => {
      await withDatabase(async () => {
        const service = new RagVerificationService();
        const result = await service.verify({
          entity: parseEntity(options.entity),
          companyId: options.companyId,
          sampleSize: parsePositiveInteger(options.sampleSize, "sample-size"),
        });
        logger.info("RAG verification completed", result);
        if (
          result.missing +
            result.stale +
            result.invalidDimensions +
            result.orphaned +
            result.selfSearchFailures >
          0
        ) {
          process.exitCode = 1;
        }
      });
    });

  program
    .command("rag-build-index")
    .description(
      "Build the partial cosine HNSW index after the initial backfill",
    )
    .option("--log <file>", "Write logs to the given file")
    .action(async () => {
      await withDatabase(async () => {
        await new RagVerificationService().buildHnswIndex();
        logger.info("RAG HNSW index is ready", {
          index: "idx_ai_chunks_embedding_hnsw",
        });
      });
    });

  program
    .command("rag-purge-stale")
    .description("Permanently delete old soft-deleted RAG chunks")
    .requiredOption(
      "--older-than <date>",
      "Delete chunks older than this ISO date",
    )
    .option("--log <file>", "Write logs to the given file")
    .option("--dry-run", "Count rows without deleting them", false)
    .action(async (options) => {
      const olderThan = new Date(options.olderThan);
      if (Number.isNaN(olderThan.getTime())) {
        throw new Error("older-than must be a valid ISO date");
      }
      await withDatabase(async () => {
        const count = await new RagVerificationService().purgeStale(
          olderThan,
          options.dryRun,
        );
        logger.info("RAG stale purge completed", {
          olderThan: olderThan.toISOString(),
          dryRun: options.dryRun,
          count,
        });
      });
    });
};
