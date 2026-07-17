import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('exposes metrics content type and text payload', async () => {
    expect(service.getContentType()).toContain('text/plain');
    const metrics = await service.getMetrics();
    expect(typeof metrics).toBe('string');
  });

  it('tracks HTTP request lifecycle metrics', async () => {
    service.startHttpRequest('get', '/leases/123?foo=bar');
    service.observeHttpRequest('get', '/leases/123?foo=bar', 200, 0.12);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('route="/leases/:id"');
    expect(metrics).toContain('method="GET"');
  });

  it('records frontend web vitals, client errors and api failures', async () => {
    service.recordFrontendMetric({
      type: 'web_vital',
      name: 'LCP',
      value: 1.25,
      path: '/dashboard/550e8400-e29b-41d4-a716-446655440000',
    } as any);
    service.recordFrontendMetric({
      type: 'web_vital',
      name: '',
      value: undefined,
      path: '/ignored',
    } as any);
    service.recordFrontendMetric({
      type: 'client_error',
      errorType: 'TypeError',
      path: '/leases',
    } as any);
    service.recordFrontendMetric({
      type: 'api_error',
      method: 'post',
      endpoint: '/api/payments/123',
      statusCode: 500,
      path: '/api/payments/123',
    } as any);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('frontend_web_vital_value');
    expect(metrics).toContain('frontend_client_errors_total');
    expect(metrics).toContain('frontend_api_failures_total');
  });

  it('records the complete RAG metrics contract', async () => {
    process.env.AI_RAG_INPUT_USD_PER_MILLION = '0.15';
    process.env.AI_RAG_OUTPUT_USD_PER_MILLION = '0.60';
    service.recordRagRequest({
      strategy: 'hybrid',
      outcome: 'success',
      durationMs: 120,
      retrieved: 4,
      abstained: true,
      citationFailures: 2,
      staleRejections: 1,
      authorizationRejections: 1,
      promptOverrideOrigins: ['query', 'evidence'],
      model: 'gpt-test',
      inputTokens: 1000,
      outputTokens: 200,
    });

    const metrics = await service.getMetrics();
    expect(metrics).toContain('ai_rag_requests_total');
    expect(metrics).toContain('ai_rag_request_duration_seconds');
    expect(metrics).toContain('ai_rag_retrieved_chunks');
    expect(metrics).toContain('ai_rag_abstentions_total');
    expect(metrics).toContain('ai_rag_citation_failures_total');
    expect(metrics).toContain('ai_rag_scope_rejections_total');
    expect(metrics).toContain('ai_rag_prompt_override_attempts_total');
    expect(metrics).toContain(
      'ai_rag_tokens_total{direction="input",model="gpt-test"} 1000',
    );
    expect(metrics).toContain('ai_rag_estimated_cost_usd_total');
    delete process.env.AI_RAG_INPUT_USD_PER_MILLION;
    delete process.env.AI_RAG_OUTPUT_USD_PER_MILLION;
  });
});
