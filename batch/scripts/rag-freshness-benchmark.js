/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("node:crypto");
const { Client } = require("pg");

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const propertyId = valueOf(
  "--property-id",
  process.env.AI_RAG_LOAD_PROPERTY_ID,
);
const samples = Number(valueOf("--samples", "20"));
const pollMs = Number(valueOf("--poll-ms", "250"));
const timeoutMs = Number(valueOf("--timeout-ms", "60000"));
const slaMs = Number(valueOf("--sla-ms", "60000"));

const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0;
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function databaseConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.POSTGRES_HOST || "localhost",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "rent_user",
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD,
    database: process.env.POSTGRES_DB || "rent_db",
  };
}

async function waitForProjection(db, companyId, expectedSourceUpdatedAt) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const result = await db.query(
      `SELECT 1
         FROM ai_knowledge_chunks
        WHERE company_id = $1::uuid
          AND entity_type = 'property_summary'
          AND entity_id = $2::uuid
          AND deleted_at IS NULL
          AND embedding IS NOT NULL
          AND source_updated_at >= $3::timestamptz
        LIMIT 1`,
      [companyId, propertyId, expectedSourceUpdatedAt],
    );
    if (result.rowCount > 0) return Date.now() - startedAt;
    await delay(pollMs);
  }
  throw new Error(`projection did not become fresh within ${timeoutMs}ms`);
}

async function updateNotes(db, notes) {
  const result = await db.query(
    `UPDATE properties
        SET notes = $2
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING company_id, updated_at`,
    [propertyId, notes],
  );
  if (result.rowCount !== 1) throw new Error("benchmark property not found");
  return result.rows[0];
}

async function main() {
  if (process.env.RAG_BENCHMARK_CONFIRM !== "isolated-environment") {
    throw new Error(
      "Set RAG_BENCHMARK_CONFIRM=isolated-environment; this benchmark updates and restores one property",
    );
  }
  if (!propertyId) throw new Error("--property-id is required");
  if (!Number.isInteger(samples) || samples < 1 || samples > 1000) {
    throw new Error("--samples must be an integer between 1 and 1000");
  }

  const db = new Client(databaseConfig());
  await db.connect();
  const original = await db.query(
    `SELECT company_id, notes
       FROM properties
      WHERE id = $1::uuid AND deleted_at IS NULL`,
    [propertyId],
  );
  if (original.rowCount !== 1) throw new Error("benchmark property not found");
  const originalNotes = original.rows[0].notes;
  const latencies = [];

  try {
    for (let index = 0; index < samples; index += 1) {
      const marker = `rag-freshness-${crypto.randomUUID()}`;
      const updated = await updateNotes(db, marker);
      latencies.push(
        await waitForProjection(db, updated.company_id, updated.updated_at),
      );
    }
  } finally {
    const restored = await updateNotes(db, originalNotes);
    await waitForProjection(db, restored.company_id, restored.updated_at);
    await db.end();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    propertyId,
    samples: latencies.length,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    maxMs: Math.max(...latencies),
    slaMs,
    passed: percentile(latencies, 0.95) < slaMs,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
