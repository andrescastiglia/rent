const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const samples = (value) => Number.isInteger(value) && value > 0;
const percentile = (metric, limit) =>
  samples(metric?.samples) &&
  finite(metric?.p95) &&
  metric.p95 >= 0 &&
  metric.p95 < limit;
const requiredRoles = ['admin', 'staff', 'owner', 'tenant', 'buyer'];

/** Release gates fail closed when the evaluation did not measure a required SLO. */
function evaluateQualityGates(summary) {
  const gates = {
    recall:
      samples(summary.recallSamples) &&
      finite(summary.recallAtK) &&
      summary.recallAtK >= 0.95 &&
      summary.recallAtK <= 1,
    errors:
      samples(summary.total) &&
      Number.isInteger(summary.failed) &&
      summary.failed >= 0 &&
      summary.failed <= summary.total &&
      summary.failed / summary.total < 0.01,
    latency: percentile(summary.latencyMs, 8000),
    freshness: percentile(summary.freshnessMs, 60000),
    roles:
      Array.isArray(summary.coveredRoles) &&
      requiredRoles.every((role) => summary.coveredRoles.includes(role)),
    isolation:
      summary.crossScopeLeaks === 0 &&
      summary.forbiddenEntityLeaks === 0 &&
      summary.forbiddenOutputLeaks === 0,
    financial: summary.financialViolations === 0,
  };
  return { passed: Object.values(gates).every(Boolean), gates };
}

module.exports = { evaluateQualityGates };
