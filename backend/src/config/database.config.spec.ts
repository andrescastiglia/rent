import { ConfigService } from '@nestjs/config';
import { getDatabaseConfig } from './database.config';

describe('getDatabaseConfig', () => {
  it('uses DATABASE_URL when provided', () => {
    const get = jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'DATABASE_URL') return 'postgres://db-url';
      return defaultValue;
    });

    const config = getDatabaseConfig({ get } as unknown as ConfigService);

    expect(config).toEqual(
      expect.objectContaining({
        type: 'postgres',
        url: 'postgres://db-url',
        logging: false,
      }),
    );
    expect(config).not.toEqual(
      expect.objectContaining({ host: expect.any(String) }),
    );
  });

  it('uses discrete postgres env vars when DATABASE_URL is absent', () => {
    const get = jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        NODE_ENV: 'development',
        DATABASE_URL: undefined,
        POSTGRES_HOST: 'db',
        POSTGRES_PORT: 6543,
        POSTGRES_USER: 'rent',
        POSTGRES_PASSWORD: 'secret',
        POSTGRES_DB: 'rent_db',
        TYPEORM_SYNC: 'true',
      };
      return key in values ? values[key] : defaultValue;
    });

    const config = getDatabaseConfig({ get } as unknown as ConfigService);

    expect(config).toEqual(
      expect.objectContaining({
        type: 'postgres',
        host: 'db',
        port: 6543,
        username: 'rent',
        password: 'secret',
        database: 'rent_db',
        synchronize: true,
        logging: true,
      }),
    );
  });
});
