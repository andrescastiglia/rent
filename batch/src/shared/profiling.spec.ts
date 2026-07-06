const initMock = jest.fn();
const startMock = jest.fn();
const stopMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@pyroscope/nodejs", () => ({
  init: (...args: unknown[]) => initMock(...args),
  start: (...args: unknown[]) => startMock(...args),
  stop: (...args: unknown[]) => stopMock(...args),
}));

describe("profiling", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PYROSCOPE_SERVER_ADDRESS;
    delete process.env.PYROSCOPE_URL;
    delete process.env.PYROSCOPE_ENABLED;
    delete process.env.PYROSCOPE_TAGS;
    delete process.env.PYROSCOPE_APPLICATION_NAME_BATCH;
    delete process.env.PYROSCOPE_APPLICATION_NAME;
    delete process.env.PYROSCOPE_FLUSH_INTERVAL_MS;
    delete process.env.NODE_ENV;
    delete process.env.CI;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not start when profiling is disabled or unavailable", async () => {
    let profiling = await import("./profiling");
    await profiling.stopProfiling();
    await profiling.startProfiling();
    expect(initMock).not.toHaveBeenCalled();

    jest.resetModules();
    process.env.PYROSCOPE_URL = "http://pyroscope:4040";
    process.env.PYROSCOPE_ENABLED = "false";
    profiling = await import("./profiling");
    await profiling.startProfiling();

    expect(initMock).not.toHaveBeenCalled();
  });

  it("starts pyroscope with configured server and tags, then stops it", async () => {
    process.env.PYROSCOPE_SERVER_ADDRESS = "http://pyroscope:4040";
    process.env.PYROSCOPE_TAGS = "team=core, invalid, region=ar=ba";
    process.env.PYROSCOPE_APPLICATION_NAME_BATCH = "rent-batch-ci";
    process.env.PYROSCOPE_FLUSH_INTERVAL_MS = "5000";
    process.env.NODE_ENV = "production";
    process.env.npm_package_version = "1.2.3";

    const profiling = await import("./profiling");

    await profiling.startProfiling();
    await profiling.startProfiling();

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "rent-batch-ci",
        serverAddress: "http://pyroscope:4040",
        flushIntervalMs: 5000,
        tags: {
          env: "production",
          service: "rent-batch-ci",
          version: "1.2.3",
          team: "core",
          region: "ar=ba",
        },
      }),
    );
    expect(startMock).toHaveBeenCalledTimes(1);

    await profiling.stopProfiling();

    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("does not start in CI or test environments", async () => {
    process.env.PYROSCOPE_URL = "http://pyroscope:4040";
    process.env.CI = "true";

    let profiling = await import("./profiling");
    await profiling.startProfiling();

    jest.resetModules();
    process.env = {
      ...process.env,
      CI: undefined,
      NODE_ENV: "test",
    };
    profiling = await import("./profiling");
    await profiling.startProfiling();

    expect(initMock).not.toHaveBeenCalled();
  });
});
