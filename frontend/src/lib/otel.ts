import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

declare global {
  interface Window {
    __rentOtelInitialized?: boolean;
  }
}

function parseHeaders(rawHeaders: string | undefined): Record<string, string> {
  if (!rawHeaders) {
    return {};
  }

  return rawHeaders
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

function resolveTraceExporterUrl(): string | undefined {
  const tracesEndpoint =
    process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (tracesEndpoint) {
    return tracesEndpoint;
  }

  const endpoint = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return undefined;
  }

  return `${endpoint.replace(/\/$/, "")}/v1/traces`;
}

function resolvePropagationTargets(): Array<string | RegExp> {
  const targets = [window.location.origin];
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      targets.push(new URL(apiUrl).origin);
    } catch {
      // Ignore invalid URL at runtime.
    }
  }
  return targets;
}

export function initOtel(): void {
  if (typeof window === "undefined" || window.__rentOtelInitialized) {
    return;
  }

  if (
    process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.CI === "true"
  ) {
    return;
  }

  const traceUrl = resolveTraceExporterUrl();
  if (!traceUrl) {
    return;
  }

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]:
        process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME || "rent-frontend-web",
      [SEMRESATTRS_SERVICE_VERSION]:
        process.env.NEXT_PUBLIC_APP_VERSION ||
        process.env.npm_package_version ||
        "0.1.0",
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        process.env.NEXT_PUBLIC_OTEL_ENVIRONMENT ||
        process.env.NODE_ENV ||
        "development",
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: traceUrl,
          headers: parseHeaders(
            process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_HEADERS,
          ),
        }),
      ),
    ],
  });

  provider.register();

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        clearTimingResources: true,
        propagateTraceHeaderCorsUrls: resolvePropagationTargets(),
        ignoreUrls: [/\/frontend-metrics$/],
      }),
    ],
  });

  window.__rentOtelInitialized = true;
}
