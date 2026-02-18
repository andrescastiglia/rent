import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { FrontendMetricDto } from './dto/frontend-metric.dto';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  private readonly httpRequestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  private readonly httpRequestsInFlight = new Gauge({
    name: 'http_requests_in_flight',
    help: 'Current number of in-flight HTTP requests',
    labelNames: ['method', 'route'] as const,
    registers: [this.registry],
  });

  private readonly frontendWebVitalValue = new Histogram({
    name: 'frontend_web_vital_value',
    help: 'Frontend Web Vitals values reported by clients',
    labelNames: ['metric_name', 'route'] as const,
    buckets: [0.001, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 4, 8],
    registers: [this.registry],
  });

  private readonly frontendClientErrorsTotal = new Counter({
    name: 'frontend_client_errors_total',
    help: 'Frontend client-side errors reported by clients',
    labelNames: ['error_type', 'route'] as const,
    registers: [this.registry],
  });

  private readonly frontendApiFailuresTotal = new Counter({
    name: 'frontend_api_failures_total',
    help: 'Frontend API failures reported by clients',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'backend_',
    });
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  startHttpRequest(method: string, route: string): void {
    this.httpRequestsInFlight.inc({
      method: this.normalizeMethod(method),
      route: this.normalizeRoute(route),
    });
  }

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method: this.normalizeMethod(method),
      route: this.normalizeRoute(route),
      status_code: this.normalizeStatusCode(statusCode),
    };

    this.httpRequestsInFlight.dec({
      method: labels.method,
      route: labels.route,
    });
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  recordFrontendMetric(metric: FrontendMetricDto): void {
    if (metric.type === 'web_vital') {
      if (!metric.name || typeof metric.value !== 'number') {
        return;
      }

      this.frontendWebVitalValue.observe(
        {
          metric_name: this.normalizeLabelValue(metric.name, 32),
          route: this.normalizeRoute(metric.path),
        },
        metric.value,
      );
      return;
    }

    if (metric.type === 'client_error') {
      this.frontendClientErrorsTotal.inc({
        error_type: this.normalizeLabelValue(metric.errorType ?? 'unknown', 64),
        route: this.normalizeRoute(metric.path),
      });
      return;
    }

    if (metric.type === 'api_error') {
      this.frontendApiFailuresTotal.inc({
        method: this.normalizeMethod(metric.method),
        route: this.normalizeRoute(metric.endpoint ?? metric.path),
        status_code: this.normalizeStatusCode(metric.statusCode),
      });
    }
  }

  private normalizeMethod(method?: string): string {
    if (!method) {
      return 'UNKNOWN';
    }
    return this.normalizeLabelValue(method.toUpperCase(), 12);
  }

  private normalizeStatusCode(statusCode?: number): string {
    if (!statusCode || !Number.isFinite(statusCode)) {
      return '0';
    }
    return String(Math.trunc(statusCode));
  }

  private normalizeRoute(route?: string): string {
    const rawRoute = this.normalizeLabelValue(route ?? '/unknown', 120);
    const withoutQuery = rawRoute.split('?')[0] || '/unknown';
    const collapsed = withoutQuery
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        ':id',
      )
      .replace(/\/\d+(?=\/|$)/g, '/:id');

    return collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
  }

  private normalizeLabelValue(value: string, maxLength: number): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'unknown';
    }

    const safe = trimmed.replace(/[\s\t\r\n]+/g, '_');
    return safe.length <= maxLength ? safe : safe.slice(0, maxLength);
  }
}
