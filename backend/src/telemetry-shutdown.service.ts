import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { stopProfiling } from './profiling';
import { shutdownTracing } from './tracing';

@Injectable()
export class TelemetryShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([stopProfiling(), shutdownTracing()]);
  }
}
