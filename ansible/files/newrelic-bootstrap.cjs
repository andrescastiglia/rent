'use strict';

const { createRequire } = require('node:module');
const { resolve } = require('node:path');

// Load secrets before the agent or application imports any instrumented module.
// Node's loader preserves explicit PM2 values such as the per-service app name.
process.loadEnvFile(process.env.DOTENV_CONFIG_PATH || '.env');

const usesOtlpTracing =
  process.env.RENT_TRACING_PROVIDER === 'otlp' &&
  process.env.OTEL_SDK_DISABLED !== 'true' &&
  Boolean(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim(),
  );

const requireFromApp = createRequire(resolve(process.cwd(), 'package.json'));

if (usesOtlpTracing) {
  // startTracing installs instrumentation synchronously and is idempotent;
  // the application awaits it again during bootstrap.
  const { startTracing } = requireFromApp(process.env.RENT_TRACING_MODULE);
  startTracing().catch(() => {
    console.error(
      'OpenTelemetry initialization failed before application startup',
    );
    process.exit(1);
  });
} else if (
  process.env.NEW_RELIC_LICENSE_KEY &&
  process.env.NEW_RELIC_ENABLED !== 'false'
) {
  requireFromApp('newrelic');
}
