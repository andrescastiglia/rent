import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class MetricsScrapeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.METRICS_SCRAPE_TOKEN?.trim() ?? '';
    if (!configured) {
      throw new ServiceUnavailableException(
        'Metrics scrape token is not configured',
      );
    }

    const request = context.switchToHttp().getRequest();
    const authorization = String(request.headers?.authorization ?? '');
    const headerToken = String(request.headers?.['x-metrics-token'] ?? '');
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : headerToken.trim();
    const received = Buffer.from(token);
    const expected = Buffer.from(configured);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new UnauthorizedException('Invalid metrics scrape token');
    }
    return true;
  }
}
