import { decode as base64Decode } from 'base-64';

function decodeBase64Url(input: string): string {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4;
  const withPadding =
    padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
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

/** Stable intent scope across access-token refreshes; this does not authorize API access. */
export function tokenSubject(token: string | null): string {
  if (!token) throw new Error('SESSION_EXPIRED');
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1] ?? '')) as {
      sub?: string;
      companyId?: string;
    };
    if (!payload.sub) throw new Error('Missing subject');
    return `${payload.companyId ?? ''}:${payload.sub}`;
  } catch {
    throw new Error('SESSION_EXPIRED');
  }
}
