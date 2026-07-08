type QueryValue = string | number | boolean | null | undefined;
const DOCUMENT_URL_BASE = "https://rent.local";

export function encodeRouteSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function buildPathWithQuery(
  path: string,
  query: Record<string, QueryValue>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function getSafeDocumentHref(value: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//")) {
    const url = new URL(value, DOCUMENT_URL_BASE);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
