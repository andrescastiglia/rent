describe("shared/logger", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("creates log directory using LOG_DIR and child logger", async () => {
    const existsSync = jest.fn().mockReturnValue(false);
    const mkdirSync = jest.fn();
    const childMock = jest.fn().mockReturnValue({ info: jest.fn() });
    const createLogger = jest.fn().mockReturnValue({ child: childMock });

    const format = {
      combine: jest.fn((...items: unknown[]) => items),
      timestamp: jest.fn(() => "timestamp"),
      errors: jest.fn(() => "errors"),
      printf: jest.fn((fn) => fn),
      uncolorize: jest.fn(() => "uncolorize"),
      colorize: jest.fn(() => "colorize"),
    };
    const transports = {
      File: jest.fn().mockImplementation((opts) => ({ type: "file", opts })),
      Console: jest
        .fn()
        .mockImplementation((opts) => ({ type: "console", opts })),
    };

    jest.doMock("node:fs", () => ({ existsSync, mkdirSync }));
    jest.doMock("winston", () => ({
      __esModule: true,
      default: { format, transports, createLogger },
    }));

    process.env.LOG_DIR = "./tmp-logs";

    const mod = await import("./logger");

    expect(existsSync).toHaveBeenCalledWith("./tmp-logs");
    expect(mkdirSync).toHaveBeenCalledWith("./tmp-logs", { recursive: true });
    expect(createLogger).toHaveBeenCalled();

    const child = mod.createLogger({ job: "x" });
    expect(childMock).toHaveBeenCalledWith({ job: "x" });
    expect(child).toBeDefined();
  });

  it("uses LOG_FILE path and skips mkdir when dir exists", async () => {
    const existsSync = jest.fn().mockReturnValue(true);
    const mkdirSync = jest.fn();
    const createLogger = jest.fn().mockReturnValue({ child: jest.fn() });

    const format = {
      combine: jest.fn((...items: unknown[]) => items),
      timestamp: jest.fn(() => "timestamp"),
      errors: jest.fn(() => "errors"),
      printf: jest.fn((fn) => fn),
      uncolorize: jest.fn(() => "uncolorize"),
      colorize: jest.fn(() => "colorize"),
    };
    const transports = {
      File: jest.fn().mockImplementation((opts) => ({ type: "file", opts })),
      Console: jest
        .fn()
        .mockImplementation((opts) => ({ type: "console", opts })),
    };

    jest.doMock("node:fs", () => ({ existsSync, mkdirSync }));
    jest.doMock("winston", () => ({
      __esModule: true,
      default: { format, transports, createLogger },
    }));

    process.env.LOG_FILE = "/tmp/rent/batch.log";

    await import("./logger");

    expect(existsSync).toHaveBeenCalledWith("/tmp/rent");
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(transports.File).toHaveBeenCalled();
    expect(transports.Console).toHaveBeenCalled();
    expect(createLogger).toHaveBeenCalledWith(
      expect.objectContaining({ level: process.env.LOG_LEVEL || "info" }),
    );
  });
});
