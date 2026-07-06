import { DataSource } from 'typeorm';
import { PostgresExtensionsService } from './postgres-extensions.service';

describe('PostgresExtensionsService', () => {
  it('creates the unaccent extension for postgres datasources', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const service = new PostgresExtensionsService({
      options: { type: 'postgres' },
      query,
    } as unknown as DataSource);

    await service.onApplicationBootstrap();

    expect(query).toHaveBeenCalledWith(
      'CREATE EXTENSION IF NOT EXISTS unaccent',
    );
  });

  it('skips non-postgres datasources', async () => {
    const query = jest.fn();
    const service = new PostgresExtensionsService({
      options: { type: 'sqlite' },
      query,
    } as unknown as DataSource);

    await service.onApplicationBootstrap();

    expect(query).not.toHaveBeenCalled();
  });
});
