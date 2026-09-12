import { Injectable, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class TelemetryShutdownService implements OnApplicationShutdown {
  private callbacks: Array<() => Promise<void>> = [];

  configure(callbacks: Array<() => Promise<void>>): void {
    this.callbacks = callbacks;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.callbacks.map((callback) => callback()));
  }
}
