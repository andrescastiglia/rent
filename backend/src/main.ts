const usesOtlpTracing =
  process.env.OTEL_SDK_DISABLED !== 'true' &&
  Boolean(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim(),
  );

if (
  process.env.NEW_RELIC_LICENSE_KEY &&
  process.env.NEW_RELIC_ENABLED !== 'false' &&
  !usesOtlpTracing
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('newrelic');
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { TelemetryShutdownService } from './telemetry-shutdown.service';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { startProfiling, stopProfiling } from './profiling';
import { startTracing, shutdownTracing } from './tracing';
import {
  getRuntimeCorsOptions,
  getRuntimeHttpSecurityConfig,
} from './config/runtime-security.config';

async function bootstrap() {
  startProfiling();
  await startTracing();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.get(TelemetryShutdownService).configure([stopProfiling, shutdownTracing]);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  const httpSecurity = getRuntimeHttpSecurityConfig(process.env);
  app.set('trust proxy', httpSecurity.trustProxyHops);

  app.enableCors(getRuntimeCorsOptions(httpSecurity));

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
