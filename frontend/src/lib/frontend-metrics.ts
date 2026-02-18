const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const METRICS_URL = `${API_URL.replace(/\/$/, "")}/frontend-metrics`;

type FrontendMetricPayload =
  | {
      type: "web_vital";
      name: string;
      value: number;
      path: string;
    }
  | {
      type: "client_error";
      errorType: string;
      path: string;
    }
  | {
      type: "api_error";
      method: string;
      endpoint: string;
      statusCode: number;
      path: string;
    };

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

function normalizePath(path: string): string {
  const sanitized = path
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ":id",
    )
    .replace(/\/\d+(?=\/|$)/g, "/:id");

  return sanitized || "/unknown";
}

function sendMetric(payload: FrontendMetricPayload): void {
  if (!isBrowserRuntime()) {
    return;
  }

  const body = JSON.stringify(payload);
  void fetch(METRICS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function getCurrentPath(): string {
  if (!isBrowserRuntime()) {
    return "/unknown";
  }
  return normalizePath(window.location.pathname || "/");
}

export function reportWebVital(
  name: string,
  value: number,
  path: string,
): void {
  const normalizedValue = name === "CLS" ? value : value / 1000;
  sendMetric({
    type: "web_vital",
    name,
    value: normalizedValue,
    path: normalizePath(path),
  });
}

export function reportClientError(errorType: string, path?: string): void {
  sendMetric({
    type: "client_error",
    errorType: errorType || "unknown",
    path: normalizePath(path ?? getCurrentPath()),
  });
}

export function reportApiError(input: {
  method: string;
  endpoint: string;
  statusCode: number;
  path?: string;
}): void {
  sendMetric({
    type: "api_error",
    method: input.method.toUpperCase(),
    endpoint: normalizePath(input.endpoint),
    statusCode: input.statusCode,
    path: normalizePath(input.path ?? getCurrentPath()),
  });
}
