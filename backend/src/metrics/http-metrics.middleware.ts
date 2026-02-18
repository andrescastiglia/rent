import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();
    const route = this.resolveRouteLabel(req);
    const method = req.method;

    if (!this.shouldSkipRoute(route)) {
      this.metricsService.startHttpRequest(method, route);
    }

    res.on('finish', () => {
      if (this.shouldSkipRoute(route)) {
        return;
      }

      const elapsedNs = process.hrtime.bigint() - startNs;
      const elapsedSeconds = Number(elapsedNs) / 1_000_000_000;
      this.metricsService.observeHttpRequest(
        method,
        route,
        res.statusCode,
        elapsedSeconds,
      );
    });

    next();
  }

  private shouldSkipRoute(route: string): boolean {
    return route === '/metrics';
  }

  private resolveRouteLabel(req: Request): string {
    const routePath = req.route?.path;

    if (typeof routePath === 'string') {
      const baseUrl = req.baseUrl ?? '';
      const fullRoute = `${baseUrl}${routePath}` || '/';
      return fullRoute.startsWith('/') ? fullRoute : `/${fullRoute}`;
    }

    return req.path || req.originalUrl || '/unknown';
  }
}
