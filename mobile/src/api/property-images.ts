import { API_URL } from '@/api/env';

export function propertyImageUrl(url: string, base = API_URL): string {
  if (!url) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  if (
    !path.startsWith('/properties/images/') &&
    !path.startsWith('/uploads/')
  ) {
    return url;
  }
  return new URL(path.slice(1), `${base.replace(/\/+$/, '')}/`).toString();
}
