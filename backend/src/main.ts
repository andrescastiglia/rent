import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { startProfiling, stopProfiling } from './profiling';
import { shutdownTracing, startTracing } from './tracing';

async function bootstrap() {
  startProfiling();
  await startTracing();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);

  // Enable CORS for frontend
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : ['http://localhost:3000'];

  app.enableCors({
    origin: allowedOrigins,
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

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`Backend running on http://${host}:${port}`);
}
void bootstrap();

const shutdownSignals = ['SIGTERM', 'SIGINT'] as const;
for (const signal of shutdownSignals) {
  process.once(signal, () => {
    void stopProfiling();
    void shutdownTracing();
  });
}
