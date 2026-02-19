import { HttpMetricsMiddleware } from './http-metrics.middleware';

describe('HttpMetricsMiddleware', () => {
  const buildRes = () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    return {
      statusCode: 201,
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers.set(event, cb);
      }),
      emitFinish: () => handlers.get('finish')?.(),
    };
  };

  it('observes request lifecycle for routable paths', () => {
    const metricsService = {
      startHttpRequest: jest.fn(),
      observeHttpRequest: jest.fn(),
    } as any;
    const middleware = new HttpMetricsMiddleware(metricsService);

    const res = buildRes();
    const req = {
      method: 'GET',
      baseUrl: '/api',
      route: { path: '/leases/:id' },
      path: '/ignored',
      originalUrl: '/ignored',
    } as any;
    const next = jest.fn();

    middleware.use(req, res as any, next);
    expect(metricsService.startHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/api/leases/:id',
    );
    expect(next).toHaveBeenCalled();

    res.emitFinish();
    expect(metricsService.observeHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/api/leases/:id',
      201,
      expect.any(Number),
    );
  });

  it('skips /metrics and resolves fallback labels', () => {
    const metricsService = {
      startHttpRequest: jest.fn(),
      observeHttpRequest: jest.fn(),
    } as any;
    const middleware = new HttpMetricsMiddleware(metricsService);

    const metricsReq = {
      method: 'GET',
      baseUrl: '',
      route: { path: '/metrics' },
      path: '/metrics',
      originalUrl: '/metrics',
    } as any;
    const metricsRes = buildRes();

    middleware.use(metricsReq, metricsRes as any, jest.fn());
    metricsRes.emitFinish();
    expect(metricsService.startHttpRequest).not.toHaveBeenCalled();
    expect(metricsService.observeHttpRequest).not.toHaveBeenCalled();

    const unknownReq = {
      method: 'POST',
      route: { path: 123 },
      path: '',
      originalUrl: '',
    } as any;
    const unknownRes = buildRes();
    middleware.use(unknownReq, unknownRes as any, jest.fn());
    unknownRes.emitFinish();

    expect(metricsService.startHttpRequest).toHaveBeenCalledWith(
      'POST',
      '/unknown',
    );
    expect(metricsService.observeHttpRequest).toHaveBeenCalledWith(
      'POST',
      '/unknown',
      201,
      expect.any(Number),
    );
  });
});
