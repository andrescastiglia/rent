import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;
let started = false;

function parseHeaders(rawHeaders: string | undefined): Record<string, string> {
  if (!rawHeaders) {
    return {};
  }

  return rawHeaders
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, ...valueParts] = entry.split('=');
      const value = valueParts.join('=').trim();
      if (!key || !value) {
        return acc;
      }

      acc[key.trim()] = value;
      return acc;
    }, {});
}

function resolveOtlpTraceUrl(): string | undefined {
  const tracesEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (tracesEndpoint) {
    return tracesEndpoint;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return undefined;
  }

  return `${endpoint.replace(/\/$/, '')}/v1/traces`;
}

export async function startTracing(): Promise<void> {
  if (started || process.env.OTEL_SDK_DISABLED === 'true') {
    return;
  }

  const traceUrl = resolveOtlpTraceUrl();
  if (!traceUrl) {
    return;
  }

  if (process.env.OTEL_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME_BACKEND ||
        process.env.OTEL_SERVICE_NAME ||
        'rent-backend',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        process.env.OTEL_ENVIRONMENT || process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: traceUrl,
      headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  await sdk.start();
  started = true;
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }

  await sdk.shutdown().catch(() => undefined);
  sdk = null;
  started = false;
}
