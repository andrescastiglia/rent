import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MetricsScrapeGuard } from './metrics-scrape.guard';

describe('MetricsScrapeGuard', () => {
  const guard = new MetricsScrapeGuard();
  const context = (headers: Record<string, string> = {}) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as any;
  const previous = process.env.METRICS_SCRAPE_TOKEN;

  afterEach(() => {
    if (previous === undefined) delete process.env.METRICS_SCRAPE_TOKEN;
    else process.env.METRICS_SCRAPE_TOKEN = previous;
  });

  it('fails closed when the operational token is missing', () => {
    delete process.env.METRICS_SCRAPE_TOKEN;
    expect(() => guard.canActivate(context())).toThrow(
      ServiceUnavailableException,
    );
  });

  it('accepts only the configured bearer or metrics token', () => {
    process.env.METRICS_SCRAPE_TOKEN = 'scrape-secret';
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(context({ authorization: 'Bearer wrong' })),
    ).toThrow(UnauthorizedException);
    expect(
      guard.canActivate(context({ authorization: 'Bearer scrape-secret' })),
    ).toBe(true);
    expect(
      guard.canActivate(context({ 'x-metrics-token': 'scrape-secret' })),
    ).toBe(true);
  });
});
