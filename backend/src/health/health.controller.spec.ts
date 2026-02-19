import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('runs health check with db ping indicator', async () => {
    const db = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };
    const health = {
      check: jest.fn(async (checks: Array<() => Promise<unknown>>) => {
        const values = await Promise.all(checks.map((fn) => fn()));
        return { status: 'ok', info: values[0] };
      }),
    };

    const controller = new HealthController(health as any, db as any);
    const result = await controller.check();

    expect(health.check).toHaveBeenCalledTimes(1);
    expect(db.pingCheck).toHaveBeenCalledWith('database');
    expect(result).toEqual({
      status: 'ok',
      info: { database: { status: 'up' } },
    });
  });
});
