import * as pyroscope from "@pyroscope/nodejs";

let started = false;

function parseTags(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, ...valueParts] = entry.split("=");
      const value = valueParts.join("=").trim();
      if (!key || !value) {
        return acc;
      }

      acc[key.trim()] = value;
      return acc;
    }, {});
}

function resolvePyroscopeServerAddress(): string | undefined {
  return (
    process.env.PYROSCOPE_SERVER_ADDRESS?.trim() ||
    process.env.PYROSCOPE_URL?.trim()
  );
}

function shouldEnableProfiling(): boolean {
  if (process.env.PYROSCOPE_ENABLED === "false") {
    return false;
  }

  if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
    return false;
  }

  return Boolean(resolvePyroscopeServerAddress());
}

export function startProfiling(): void {
  if (started || !shouldEnableProfiling()) {
    return;
  }

  const serverAddress = resolvePyroscopeServerAddress();
  if (!serverAddress) {
    return;
  }

  const baseTags = {
    env: process.env.PYROSCOPE_ENV || process.env.NODE_ENV || "development",
    service:
      process.env.PYROSCOPE_APPLICATION_NAME_BATCH ||
      process.env.PYROSCOPE_APPLICATION_NAME ||
      "rent-batch",
    version: process.env.npm_package_version || "1.0.0",
    ...parseTags(process.env.PYROSCOPE_TAGS),
  };

  pyroscope.init({
    appName:
      process.env.PYROSCOPE_APPLICATION_NAME_BATCH ||
      process.env.PYROSCOPE_APPLICATION_NAME ||
      "rent-batch",
    serverAddress,
    authToken: process.env.PYROSCOPE_AUTH_TOKEN,
    flushIntervalMs: Number(process.env.PYROSCOPE_FLUSH_INTERVAL_MS || 10000),
    basicAuthUser: process.env.PYROSCOPE_BASIC_AUTH_USER,
    basicAuthPassword: process.env.PYROSCOPE_BASIC_AUTH_PASSWORD,
    tenantID: process.env.PYROSCOPE_TENANT_ID,
    tags: baseTags,
    wall: {
      collectCpuTime: true,
    },
  });

  pyroscope.start();
  started = true;
}

export async function stopProfiling(): Promise<void> {
  if (!started) {
    return;
  }

  await pyroscope.stop().catch(() => undefined);
  started = false;
}
