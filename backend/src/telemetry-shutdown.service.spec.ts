import { TelemetryShutdownService } from './telemetry-shutdown.service';
import { stopProfiling } from './profiling';
import { shutdownTracing } from './tracing';
jest.mock('./profiling', () => ({ stopProfiling: jest.fn() }));
jest.mock('./tracing', () => ({ shutdownTracing: jest.fn() }));
it('awaits both telemetry shutdowns even if one fails', async () => {
  (stopProfiling as jest.Mock).mockRejectedValue(
    new Error('profiling unavailable'),
  );
  (shutdownTracing as jest.Mock).mockResolvedValue(undefined);
  await expect(
    new TelemetryShutdownService().onApplicationShutdown(),
  ).resolves.toBeUndefined();
  expect(shutdownTracing).toHaveBeenCalledTimes(1);
});
