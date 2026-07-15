/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('node:fs');
const { Client } = require('pg');
const { JwtService } = require('@nestjs/jwt');
const evaluationCases = require('../evals/rag-eval.dataset.json');

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const baseUrl = valueOf(
  '--base-url',
  process.env.AI_EVAL_BASE_URL || 'http://127.0.0.1:3001',
);
const limit = Number(valueOf('--limit', '0'));
const roleFilter = valueOf('--role', '');
const categoryFilter = valueOf('--category', '');

function evaluationEndpoint(rawBaseUrl) {
  let endpoint;
  try {
    endpoint = new URL('/ai/respond', rawBaseUrl);
  } catch {
    throw new Error('AI evaluation base URL must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('AI evaluation base URL must use HTTP or HTTPS');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('AI evaluation base URL must not contain credentials');
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const allowedOrigins = new Set(
    (process.env.AI_EVAL_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (!loopbackHosts.has(endpoint.hostname)) {
    if (endpoint.protocol !== 'https:') {
      throw new Error('Remote AI evaluation endpoints must use HTTPS');
    }
    if (!allowedOrigins.has(endpoint.origin)) {
      throw new Error(
        `AI evaluation endpoint ${endpoint.origin} is not in AI_EVAL_ALLOWED_ORIGINS`,
      );
    }
  }
  return endpoint;
}

function dbConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ...(process.env.NODE_ENV === 'production'
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    };
  }
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || 'rent_user',
    password:
      process.env.POSTGRES_PASSWORD ||
      process.env.PGPASSWORD ||
      process.env.DATABASE_PASSWORD,
    database: process.env.POSTGRES_DB || 'rent_db',
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.ceil(sorted.length * p) - 1, sorted.length - 1)];
}

async function shadowReport(db) {
  const result = await db.query(
    `
    SELECT status, count(*)::int AS count,
           round(avg(lexical_similarity), 4) AS avg_lexical_similarity,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY rag_latency_ms) AS rag_p50_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY rag_latency_ms) AS rag_p95_ms,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY tools_latency_ms) AS tools_p50_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY tools_latency_ms) AS tools_p95_ms
      FROM ai_rag_shadow_comparisons
     WHERE created_at > now() - ($1::text || ' hours')::interval
     GROUP BY status ORDER BY status`,
    [valueOf('--hours', '24')],
  );
  console.log(
    JSON.stringify(
      { generatedAt: new Date().toISOString(), rows: result.rows },
      null,
      2,
    ),
  );
}

async function findUser(db, test) {
  return (
    await db.query(
      `SELECT id, permissions FROM users
        WHERE company_id = $1::uuid AND role::text = $2
          AND deleted_at IS NULL AND is_active = true
        ORDER BY created_at LIMIT 1`,
      [test.companyId, test.role],
    )
  ).rows[0];
}

async function sourceAuthorized(db, source, test, userId) {
  const type = source.entityType;
  const entityId = source.entityId;
  if (type === 'structured_query') {
    return entityId === test.companyId;
  }
  const params = ['owner', 'tenant'].includes(test.role)
    ? [entityId, test.companyId, userId]
    : [entityId, test.companyId];
  if (type === 'property' || type === 'property_summary') {
    const scope =
      test.role === 'owner'
        ? `AND EXISTS (SELECT 1 FROM owners o WHERE o.id=p.owner_id AND o.user_id=$3::uuid AND o.deleted_at IS NULL)`
        : test.role === 'tenant'
          ? `AND EXISTS (SELECT 1 FROM leases l JOIN tenants t ON t.id=l.tenant_id WHERE l.property_id=p.id AND l.deleted_at IS NULL AND t.deleted_at IS NULL AND t.user_id=$3::uuid)`
          : '';
    return (
      Number(
        (
          await db.query(
            `SELECT count(*) n FROM properties p WHERE p.id=$1::uuid AND p.company_id=$2::uuid AND p.deleted_at IS NULL ${scope}`,
            params,
          )
        ).rows[0].n,
      ) === 1
    );
  }
  if (type === 'lease') {
    const scope =
      test.role === 'owner'
        ? `AND EXISTS (SELECT 1 FROM owners o WHERE o.id=l.owner_id AND o.user_id=$3::uuid AND o.deleted_at IS NULL)`
        : test.role === 'tenant'
          ? `AND EXISTS (SELECT 1 FROM tenants t WHERE t.id=l.tenant_id AND t.user_id=$3::uuid AND t.deleted_at IS NULL)`
          : '';
    return (
      Number(
        (
          await db.query(
            `SELECT count(*) n FROM leases l WHERE l.id=$1::uuid AND l.company_id=$2::uuid AND l.deleted_at IS NULL ${scope}`,
            params,
          )
        ).rows[0].n,
      ) === 1
    );
  }
  if (type === 'invoice') {
    const scope =
      test.role === 'owner'
        ? `AND EXISTS (SELECT 1 FROM owners o WHERE o.id=i.owner_id AND o.user_id=$3::uuid AND o.deleted_at IS NULL)`
        : test.role === 'tenant'
          ? `AND EXISTS (SELECT 1 FROM leases l JOIN tenants t ON t.id=l.tenant_id WHERE l.id=i.lease_id AND l.deleted_at IS NULL AND t.deleted_at IS NULL AND t.user_id=$3::uuid)`
          : '';
    return (
      Number(
        (
          await db.query(
            `SELECT count(*) n FROM invoices i WHERE i.id=$1::uuid AND i.company_id=$2::uuid AND i.deleted_at IS NULL ${scope}`,
            params,
          )
        ).rows[0].n,
      ) === 1
    );
  }
  if (type === 'document_chunk') {
    const roleScope =
      test.role === 'owner'
        ? `AND ((d.entity_type='property' AND EXISTS (SELECT 1 FROM properties p JOIN owners o ON o.id=p.owner_id WHERE p.id=d.entity_id AND p.deleted_at IS NULL AND o.deleted_at IS NULL AND o.user_id=$3::uuid)) OR (d.entity_type='lease' AND EXISTS (SELECT 1 FROM leases l JOIN owners o ON o.id=l.owner_id WHERE l.id=d.entity_id AND l.deleted_at IS NULL AND o.deleted_at IS NULL AND o.user_id=$3::uuid)))`
        : test.role === 'tenant'
          ? `AND ((d.entity_type='property' AND EXISTS (SELECT 1 FROM leases l JOIN tenants t ON t.id=l.tenant_id WHERE l.property_id=d.entity_id AND l.deleted_at IS NULL AND t.deleted_at IS NULL AND t.user_id=$3::uuid)) OR (d.entity_type='lease' AND EXISTS (SELECT 1 FROM leases l JOIN tenants t ON t.id=l.tenant_id WHERE l.id=d.entity_id AND l.deleted_at IS NULL AND t.deleted_at IS NULL AND t.user_id=$3::uuid)))`
          : '';
    return (
      Number(
        (
          await db.query(
            `SELECT count(*) n FROM documents d WHERE d.id=$1::uuid AND d.company_id=$2::uuid AND d.deleted_at IS NULL ${roleScope}`,
            params,
          )
        ).rows[0].n,
      ) === 1
    );
  }
  return false;
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  const db = new Client(dbConfig());
  await db.connect();
  try {
    if (has('--shadow-report')) return await shadowReport(db);
    let tests = evaluationCases;
    if (roleFilter) tests = tests.filter((test) => test.role === roleFilter);
    if (categoryFilter)
      tests = tests.filter((test) => test.category === categoryFilter);
    if (limit > 0) tests = tests.slice(0, limit);
    if (tests.length < 1) throw new Error('No evaluation cases selected');

    const endpoint = evaluationEndpoint(baseUrl);
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const results = [];
    for (const test of tests) {
      const user = await findUser(db, test);
      if (!user) {
        results.push({ id: test.id, passed: false, error: 'no_active_user' });
        continue;
      }
      const token = await jwt.signAsync({ sub: user.id }, { expiresIn: '15m' });
      const started = Date.now();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: test.prompt }),
      });
      const latencyMs = Date.now() - started;
      const body = await response.json();
      const sources = Array.isArray(body.sources) ? body.sources : [];
      const authorization = [];
      for (const source of sources) {
        authorization.push(await sourceAuthorized(db, source, test, user.id));
      }
      const leaks = authorization.filter((allowed) => !allowed).length;
      const authorizedSourceCount = authorization.filter(Boolean).length;
      const sourceEntityIds = new Set(sources.map((source) => source.entityId));
      const expected = test.expectedEntityIds || [];
      const recall = expected.length
        ? expected.filter((id) => sourceEntityIds.has(id)).length /
          expected.length
        : null;
      const strategyOk =
        !test.expectedStrategy ||
        body.retrieval?.strategy === test.expectedStrategy;
      const abstentionOk =
        typeof test.shouldAbstain !== 'boolean' ||
        body.insufficientEvidence === test.shouldAbstain;
      const grounded = body.insufficientEvidence === true || sources.length > 0;
      const financialViolation =
        test.financial === true &&
        body.insufficientEvidence !== true &&
        sources.some(
          (source) =>
            !['invoice', 'lease', 'property', 'structured_query'].includes(
              source.entityType,
            ),
        );
      const requiredSourceOk =
        !Array.isArray(test.requiredSourceTypes) ||
        test.requiredSourceTypes.length === 0 ||
        body.insufficientEvidence === true ||
        sources.some((source) =>
          test.requiredSourceTypes.includes(source.entityType),
        );
      const passed =
        response.ok &&
        leaks === 0 &&
        strategyOk &&
        abstentionOk &&
        grounded &&
        !financialViolation &&
        requiredSourceOk &&
        (recall === null || recall > 0);
      results.push({
        id: test.id,
        role: test.role,
        category: test.category,
        passed,
        httpStatus: response.status,
        retrievalMode: body.retrievalMode,
        strategy: body.retrieval?.strategy,
        insufficientEvidence: body.insufficientEvidence,
        sourceCount: sources.length,
        authorizedSourceCount,
        leaks,
        recall,
        grounded,
        financialViolation,
        requiredSourceOk,
        latencyMs,
        inputTokens: Number(body.usage?.input_tokens || 0),
        outputTokens: Number(body.usage?.output_tokens || 0),
      });
      console.log(`${test.id}: ${passed ? 'PASS' : 'FAIL'}`);
    }

    const latencies = results
      .map((result) => result.latencyMs)
      .filter(Number.isFinite);
    const totalInputTokens = results.reduce(
      (sum, result) => sum + (result.inputTokens || 0),
      0,
    );
    const totalOutputTokens = results.reduce(
      (sum, result) => sum + (result.outputTokens || 0),
      0,
    );
    const sourceCount = results.reduce(
      (sum, result) => sum + (result.sourceCount || 0),
      0,
    );
    const authorizedSourceCount = results.reduce(
      (sum, result) => sum + (result.authorizedSourceCount || 0),
      0,
    );
    const abstentionCases = results.filter((result) =>
      tests.some(
        (test) =>
          test.id === result.id && typeof test.shouldAbstain === 'boolean',
      ),
    );
    const correctAbstentions = abstentionCases.filter((result) => {
      const expected = tests.find(
        (test) => test.id === result.id,
      )?.shouldAbstain;
      return result.insufficientEvidence === expected;
    }).length;
    const inputRate = Number(process.env.AI_RAG_INPUT_USD_PER_MILLION || 0);
    const outputRate = Number(process.env.AI_RAG_OUTPUT_USD_PER_MILLION || 0);
    const summary = {
      generatedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      crossScopeLeaks: results.reduce(
        (sum, result) => sum + (result.leaks || 0),
        0,
      ),
      sourcePrecision:
        sourceCount === 0 ? 0 : authorizedSourceCount / sourceCount,
      financialViolations: results.filter((result) => result.financialViolation)
        .length,
      financialExactnessRate:
        results.filter((result) => {
          const test = tests.find((candidate) => candidate.id === result.id);
          return test?.financial === true && result.requiredSourceOk;
        }).length /
        Math.max(tests.filter((test) => test.financial === true).length, 1),
      groundednessRate:
        results.filter((result) => result.grounded).length / results.length,
      correctAbstentionRate:
        correctAbstentions / Math.max(abstentionCases.length, 1),
      highConfidenceWrongAnswers: results.filter(
        (result) => !result.passed && result.insufficientEvidence === false,
      ).length,
      strategyAccuracy:
        results.filter((result) => {
          const expected = tests.find(
            (test) => test.id === result.id,
          )?.expectedStrategy;
          return !expected || result.strategy === expected;
        }).length / results.length,
      recallAtK:
        results
          .filter((result) => result.recall !== null)
          .reduce((sum, result) => sum + result.recall, 0) /
        Math.max(results.filter((result) => result.recall !== null).length, 1),
      latencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
      },
      tokens: {
        inputTotal: totalInputTokens,
        outputTotal: totalOutputTokens,
        averagePerQuery:
          (totalInputTokens + totalOutputTokens) / results.length,
      },
      estimatedUsdPerQuery:
        (totalInputTokens * inputRate + totalOutputTokens * outputRate) /
        1_000_000 /
        results.length,
    };
    const report = { summary, results };
    const reportPath = valueOf('--report', '');
    if (reportPath)
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    if (
      has('--strict') &&
      (summary.crossScopeLeaks > 0 ||
        summary.financialViolations > 0 ||
        summary.groundednessRate < 1 ||
        summary.failed > 0)
    ) {
      process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = { evaluationEndpoint };
