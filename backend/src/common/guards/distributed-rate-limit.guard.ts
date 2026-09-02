import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

type RateLimitPolicy = { limit: number; windowSeconds: number };

const PUBLIC_RATE_LIMITS: Record<string, RateLimitPolicy> = {
  'AuthController.login': { limit: 10, windowSeconds: 60 },
  'AuthController.register': { limit: 5, windowSeconds: 60 },
  'PaymentGatewayController.processWebhook': {
    limit: 120,
    windowSeconds: 60,
  },
  'WhatsappController.receiveWebhook': { limit: 300, windowSeconds: 60 },
  'WhatsappController.verifyWebhook': { limit: 60, windowSeconds: 60 },
  'PropertyImagesController.getPropertyImage': {
    limit: 300,
    windowSeconds: 60,
  },
};

const DEFAULT_PUBLIC_POLICY: RateLimitPolicy = {
  limit: 120,
  windowSeconds: 60,
};

function resolveRateLimitPolicy(routeKey: string): RateLimitPolicy {
  const policy = PUBLIC_RATE_LIMITS[routeKey] ?? DEFAULT_PUBLIC_POLICY;
  if (process.env.NODE_ENV !== 'test') return policy;

  const testLimit = Number(process.env.E2E_PUBLIC_RATE_LIMIT);
  if (!Number.isSafeInteger(testLimit) || testLimit < policy.limit) {
    return policy;
  }

  return { ...policy, limit: testLimit };
}

const SKIPPED_CONTROLLERS = new Set(['HealthController', 'MetricsController']);

@Injectable()
export class DistributedRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      controller,
    ]);
    if (!isPublic || SKIPPED_CONTROLLERS.has(controller.name)) {
      return true;
    }

    const routeKey = `${controller.name}.${handler.name}`;
    const policy = resolveRateLimitPolicy(routeKey);
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const clientAddress = String(
      request.ip ?? request.socket?.remoteAddress ?? 'unknown',
    );
    const bucketKey = createHash('sha256')
      .update(`${routeKey}:${clientAddress}`)
      .digest('hex');

    const rows = await this.dataSource.query(
      `INSERT INTO api_rate_limit_buckets (
         bucket_key, window_started_at, request_count, expires_at
       ) VALUES ($1, NOW(), 1, NOW() + ($2 * INTERVAL '1 second'))
       ON CONFLICT (bucket_key) DO UPDATE
       SET request_count = CASE
             WHEN api_rate_limit_buckets.expires_at <= NOW() THEN 1
             ELSE api_rate_limit_buckets.request_count + 1
           END,
           window_started_at = CASE
             WHEN api_rate_limit_buckets.expires_at <= NOW() THEN NOW()
             ELSE api_rate_limit_buckets.window_started_at
           END,
           expires_at = CASE
             WHEN api_rate_limit_buckets.expires_at <= NOW()
               THEN NOW() + ($2 * INTERVAL '1 second')
             ELSE api_rate_limit_buckets.expires_at
           END
       RETURNING request_count AS "requestCount",
                 CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())))::integer
                   AS "retryAfter"`,
      [bucketKey, policy.windowSeconds],
    );

    const requestCount = Number(rows?.[0]?.requestCount ?? policy.limit + 1);
    if (requestCount > policy.limit) {
      const retryAfter = Math.max(1, Number(rows?.[0]?.retryAfter ?? 1));
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (bucketKey.startsWith('00')) {
      await this.dataSource.query(
        `DELETE FROM api_rate_limit_buckets
         WHERE expires_at < NOW() - INTERVAL '1 hour'`,
      );
    }
    return true;
  }
}
