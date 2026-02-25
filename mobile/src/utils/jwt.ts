import { decode as base64Decode } from 'base-64';

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const withPadding = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
  return base64Decode(withPadding);
}

export function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) return true;
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    if (!parsed.exp) return true;
    return Date.now() >= parsed.exp * 1000;
  } catch {
    return true;
  }
}
