/* eslint-disable @typescript-eslint/no-require-imports */
const { evaluateQualityGates } = require('../../scripts/rag-quality-gates.cjs');

describe('RAG release quality gates', () => {
  const healthy = {
    total: 1000,
    failed: 0,
    recallAtK: 0.95,
    recallSamples: 10,
    latencyMs: { p95: 7999, samples: 1000 },
    freshnessMs: { p95: 59999, samples: 10 },
    coveredRoles: ['admin', 'staff', 'owner', 'tenant', 'buyer'],
    crossScopeLeaks: 0,
    forbiddenEntityLeaks: 0,
    forbiddenOutputLeaks: 0,
    financialViolations: 0,
  };
  it('accepts measured objectives', () =>
    expect(evaluateQualityGates(healthy).passed).toBe(true));
  it.each([
    { recallAtK: 0.949 },
    { failed: 10 },
    { latencyMs: { p95: 8000 } },
    { freshnessMs: { p95: 60000 } },
    { freshnessMs: { p95: null } },
    { crossScopeLeaks: 1 },
    { forbiddenEntityLeaks: 1 },
    { forbiddenOutputLeaks: 1 },
    { financialViolations: 1 },
    { total: 0 },
    { recallAtK: NaN },
    { recallAtK: 1.01 },
    { recallSamples: 0 },
    { recallSamples: undefined },
    { failed: -1 },
    { failed: NaN },
    { failed: 0.5 },
    { total: -1 },
    { total: 0.5 },
    { latencyMs: { p95: -1, samples: 10 } },
    { latencyMs: { p95: 0, samples: 0 } },
    { freshnessMs: { p95: -1, samples: 10 } },
    { freshnessMs: { p95: 0, samples: 0 } },
    { coveredRoles: ['admin', 'staff', 'owner', 'tenant'] },
    { coveredRoles: undefined },
    { crossScopeLeaks: undefined },
    { financialViolations: undefined },
  ])('fails an unmet or unmeasured objective: %j', (failure) => {
    expect(evaluateQualityGates({ ...healthy, ...failure }).passed).toBe(false);
  });
});
