import { TelemetryShutdownService } from './telemetry-shutdown.service';

it('awaits all telemetry shutdowns even if one fails', async () => {
  const stopProfiling = jest
    .fn()
    .mockRejectedValue(new Error('profiling unavailable'));
  const shutdownTracing = jest.fn().mockResolvedValue(undefined);
  const service = new TelemetryShutdownService();
  service.configure([stopProfiling, shutdownTracing]);
  await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  expect(shutdownTracing).toHaveBeenCalledTimes(1);
});

it('allows metadata-only tools to close without starting native telemetry', async () => {
  await expect(
    new TelemetryShutdownService().onApplicationShutdown(),
  ).resolves.toBeUndefined();
});
