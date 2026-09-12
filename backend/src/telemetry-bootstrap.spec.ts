import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const bootstrap = readFileSync(
  resolve(__dirname, '../../ansible/files/newrelic-bootstrap.cjs'),
  'utf8',
);

describe('production telemetry preload', () => {
  it.each([
    [
      'backend OTLP',
      {
        RENT_TRACING_PROVIDER: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example',
      },
      'otlp',
    ],
    [
      'batch trace endpoint',
      {
        RENT_TRACING_PROVIDER: 'otlp',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://otlp.example/v1/traces',
      },
      'otlp',
    ],
    [
      'frontend agent',
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example' },
      'newrelic',
    ],
    [
      'disabled OTLP SDK',
      {
        RENT_TRACING_PROVIDER: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example',
        OTEL_SDK_DISABLED: 'true',
      },
      'newrelic',
    ],
    [
      'empty OTLP destination',
      { RENT_TRACING_PROVIDER: 'otlp', OTEL_EXPORTER_OTLP_ENDPOINT: ' ' },
      'newrelic',
    ],
    [
      'agent disabled with OTLP',
      {
        RENT_TRACING_PROVIDER: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example',
        NEW_RELIC_ENABLED: 'false',
      },
      'otlp',
    ],
    ['both disabled', { NEW_RELIC_ENABLED: 'false' }, 'none'],
  ] as const)('loads a single provider for %s', (_name, settings, expected) => {
    const startTracing = jest.fn().mockResolvedValue(undefined);
    const requireFromApp = jest.fn((name: string) => {
      if (name === './dist/tracing.js') return { startTracing };
      if (name === 'newrelic') return {};
      throw new Error(`Unexpected module: ${name}`);
    });
    const env: Record<string, string> = {
      RENT_TRACING_MODULE: './dist/tracing.js',
      DOTENV_CONFIG_PATH: '/protected/runtime.env',
    };
    const loadEnvFile = jest.fn(() => {
      Object.assign(env, { NEW_RELIC_LICENSE_KEY: 'test-license' }, settings);
    });
    runInNewContext(bootstrap, {
      require: (name: string) => {
        if (name === 'node:path') return { resolve };
        if (name === 'node:module')
          return { createRequire: () => requireFromApp };
        throw new Error(`Unexpected import: ${name}`);
      },
      process: { env, loadEnvFile, cwd: () => '/release/backend' },
    });
    expect(loadEnvFile).toHaveBeenCalledWith('/protected/runtime.env');
    expect(startTracing).toHaveBeenCalledTimes(expected === 'otlp' ? 1 : 0);
    expect(requireFromApp.mock.calls.map(([name]) => name)).toEqual(
      expected === 'none'
        ? []
        : [expected === 'otlp' ? './dist/tracing.js' : 'newrelic'],
    );
  });
});
