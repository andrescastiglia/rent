import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

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
    process.env.PGPASSWORD = "pgpassword-secret";

    const { AppDataSource } = await import("./database");
    const options = AppDataSource.options as PostgresConnectionOptions;

    expect(options).toMatchObject({
      type: "postgres",
      host: "localhost",
      port: 5432,
      username: "rent_user",
      password: "pgpassword-secret",
      database: "rent_db",
    });
  });

  it("keeps the rent_password fallback when no password env var is present", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.PGPASSWORD;

    const { AppDataSource } = await import("./database");
    const options = AppDataSource.options as PostgresConnectionOptions;

    expect(options).toMatchObject({
      password: "rent_password",
    });
  });
});
