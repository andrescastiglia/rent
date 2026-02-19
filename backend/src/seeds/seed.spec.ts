export {};

describe('seed script', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('runs seed transaction successfully and closes datasource', async () => {
    const configMock = jest.fn();
    const genSaltMock = jest.fn().mockResolvedValue('salt');
    const hashMock = jest.fn().mockResolvedValue('hash');

    let idSeq = 0;
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (_entity: unknown, data: Record<string, unknown>) => data,
      ),
      save: jest.fn(async (entity: Record<string, unknown>) => ({
        ...entity,
        id: (entity.id as string | undefined) ?? `id-${++idSeq}`,
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const dataSourceInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const dataSourceCtorMock = jest
      .fn()
      .mockImplementation(() => dataSourceInstance);

    jest.doMock('dotenv', () => ({
      config: (...args: unknown[]) => configMock(...args),
    }));
    jest.doMock('bcrypt', () => ({
      genSalt: (...args: unknown[]) => genSaltMock(...args),
      hash: (...args: unknown[]) => hashMock(...args),
    }));
    jest.doMock('typeorm', () => {
      const actual = jest.requireActual('typeorm');
      return {
        ...actual,
        DataSource: class {
          constructor(config: unknown) {
            dataSourceCtorMock(config);
            return dataSourceInstance;
          }
        },
      };
    });

    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await import('./seed');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(configMock).toHaveBeenCalled();
    expect(dataSourceCtorMock).toHaveBeenCalled();
    expect(dataSourceInstance.initialize).toHaveBeenCalled();
    expect(dataSourceInstance.createQueryRunner).toHaveBeenCalled();
    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(dataSourceInstance.destroy).toHaveBeenCalled();
    expect(genSaltMock).toHaveBeenCalled();
    expect(hashMock).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('handles initialize failure and still destroys datasource', async () => {
    const dataSourceInstance = {
      initialize: jest.fn().mockRejectedValue(new Error('db down')),
      destroy: jest.fn().mockResolvedValue(undefined),
      createQueryRunner: jest.fn(),
    };

    const dataSourceCtorMock = jest
      .fn()
      .mockImplementation(() => dataSourceInstance);

    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    jest.doMock('bcrypt', () => ({
      genSalt: jest.fn(),
      hash: jest.fn(),
    }));
    jest.doMock('typeorm', () => {
      const actual = jest.requireActual('typeorm');
      return {
        ...actual,
        DataSource: class {
          constructor(config: unknown) {
            dataSourceCtorMock(config);
            return dataSourceInstance;
          }
        },
      };
    });

    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await import('./seed');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(dataSourceCtorMock).toHaveBeenCalled();
    expect(dataSourceInstance.initialize).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(dataSourceInstance.destroy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
