if (process.env.NEW_RELIC_LICENSE_KEY) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('newrelic');
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { startProfiling, stopProfiling } from './profiling';
import { shutdownTracing, startTracing } from './tracing';
import { getRuntimeHttpSecurityConfig } from './config/runtime-security.config';

async function bootstrap() {
  startProfiling();
  await startTracing();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const httpSecurity = getRuntimeHttpSecurityConfig(process.env);
  app.set('trust proxy', httpSecurity.trustProxyHops);

  const localDevOriginPattern =
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

  const isAllowedOrigin = (origin?: string) =>
    !origin ||
    httpSecurity.allowedOrigins.includes(origin) ||
    (httpSecurity.allowLocalDevelopmentOrigins &&
      localDevOriginPattern.test(origin));

  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin denied: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'traceparent',
      'tracestate',
      'baggage',
    ],
  });

  // Enable global validation pipe
  app.useGlobalPipes(
    new ZodValidationPipe(),
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`Backend running on http://${host}:${port}`);
}
process.nextTick(() => {
  void bootstrap().catch((error) => {
    console.error('Failed to bootstrap backend:', error);
    process.exit(1);
  });
});

const shutdownSignals = ['SIGTERM', 'SIGINT'] as const;
for (const signal of shutdownSignals) {
  process.once(signal, () => {
    void stopProfiling();
    void shutdownTracing();
  });
}
