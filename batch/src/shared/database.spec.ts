import type { DataSourceOptions } from "typeorm";

describe("shared/database", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    jest.doMock("./logger", () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses PGPASSWORD when POSTGRES_PASSWORD is not defined", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.DATABASE_PASSWORD;
    process.env.PGPASSWORD = "pgpassword-secret";

    const { AppDataSource } = await import("./database");
    const options = AppDataSource.options as DataSourceOptions;

    expect(options).toMatchObject({
      type: "postgres",
      host: "localhost",
      port: 5432,
      username: "rent_user",
      password: "pgpassword-secret",
      database: "rent_db",
    });
  });

  it("uses DATABASE_PASSWORD when postgres-specific password env vars are not defined", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.PGPASSWORD;
    process.env.DATABASE_PASSWORD = "database-password-secret";

    const { AppDataSource } = await import("./database");
    const options = AppDataSource.options as DataSourceOptions;

    expect(options).toMatchObject({
      password: "database-password-secret",
    });
  });

  it("keeps the rent_password fallback when no password env var is present", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.PGPASSWORD;
    delete process.env.DATABASE_PASSWORD;

    const { AppDataSource } = await import("./database");
    const options = AppDataSource.options as DataSourceOptions;

    expect(options).toMatchObject({
      password: "rent_password",
    });
  });

  it("initializes connection once and closes when initialized", async () => {
    const { AppDataSource, initializeDatabase, closeDatabase } =
      await import("./database");

    Object.defineProperty(AppDataSource, "isInitialized", {
      value: false,
      writable: true,
      configurable: true,
    });

    const initializeSpy = jest
      .spyOn(AppDataSource, "initialize")
      .mockResolvedValue(AppDataSource);
    const destroySpy = jest
      .spyOn(AppDataSource, "destroy")
      .mockResolvedValue(undefined);

    await initializeDatabase();
    expect(initializeSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(AppDataSource, "isInitialized", {
      value: true,
      writable: true,
      configurable: true,
    });

    await closeDatabase();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("propagates initialize and close errors", async () => {
    const { AppDataSource, initializeDatabase, closeDatabase } =
      await import("./database");

    Object.defineProperty(AppDataSource, "isInitialized", {
      value: false,
      writable: true,
      configurable: true,
    });
    jest
      .spyOn(AppDataSource, "initialize")
      .mockRejectedValueOnce(new Error("connect failed"));

    await expect(initializeDatabase()).rejects.toThrow("connect failed");

    Object.defineProperty(AppDataSource, "isInitialized", {
      value: true,
      writable: true,
      configurable: true,
    });
    jest
      .spyOn(AppDataSource, "destroy")
      .mockRejectedValueOnce(new Error("close failed"));

    await expect(closeDatabase()).rejects.toThrow("close failed");
  });
});
