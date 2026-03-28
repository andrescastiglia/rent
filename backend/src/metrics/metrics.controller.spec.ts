import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  const metricsService = {
    getContentType: jest.fn().mockReturnValue('text/plain; version=0.0.4'),
    getMetrics: jest.fn().mockResolvedValue('# HELP http_requests_total\n'),
    recordFrontendMetric: jest.fn(),
  };

  let controller: MetricsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MetricsController(metricsService as any);
  });

  it('getMetrics sets content type header and returns metrics string', async () => {
    const response = {
      setHeader: jest.fn(),
    };

    const result = await controller.getMetrics(response as any);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4',
    );
    expect(result).toBe('# HELP http_requests_total\n');
  });

  it('recordFrontendMetric delegates to service', () => {
    const metric = { metricName: 'LCP', value: 1.5, route: '/' };

    controller.recordFrontendMetric(metric as any);

    expect(metricsService.recordFrontendMetric).toHaveBeenCalledWith(metric);
  });
});
