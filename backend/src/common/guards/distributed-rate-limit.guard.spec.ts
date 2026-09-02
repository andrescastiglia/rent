import { HttpStatus } from '@nestjs/common';
import { DistributedRateLimitGuard } from './distributed-rate-limit.guard';

describe('DistributedRateLimitGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const dataSource = { query: jest.fn() };
  const response = { setHeader: jest.fn() };

  const context = (controllerName = 'AuthController', handlerName = 'login') =>
    ({
      getHandler: () => ({ name: handlerName }),
      getClass: () => ({ name: controllerName }),
      switchToHttp: () => ({
        getRequest: () => ({ ip: '203.0.113.10' }),
        getResponse: () => response,
      }),
    }) as any;

  let guard: DistributedRateLimitGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new DistributedRateLimitGuard(reflector as any, dataSource as any);
  });

  it('skips authenticated routes and operational probes', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(context())).resolves.toBe(true);

    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(
      guard.canActivate(context('HealthController', 'check')),
    ).resolves.toBe(true);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('increments a shared login bucket using the trusted request IP', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    dataSource.query.mockResolvedValue([{ requestCount: 1, retryAfter: 60 }]);

    await expect(guard.canActivate(context())).resolves.toBe(true);

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_rate_limit_buckets'),
      [expect.stringMatching(/^[0-9a-f]{64}$/), 60],
    );
  });

  it('returns 429 and Retry-After when the route policy is exceeded', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    dataSource.query.mockResolvedValue([{ requestCount: 11, retryAfter: 37 }]);

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '37');
  });

  it('fails closed when the shared store returns no counter', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    dataSource.query.mockResolvedValue([]);

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});
