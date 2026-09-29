import { Injectable } from '@nestjs/common';

/** Does not include remote response bodies, secrets or personal data. */
export class ProviderRequestError extends Error {
  constructor(
    readonly provider: string,
    readonly outcomeUnknown: boolean,
    readonly status?: number,
  ) {
    super(`${provider} request failed${status ? ` (${status})` : ''}`);
  }
}

@Injectable()
export class ProviderHttpService {
  async request(
    provider: string,
    url: string,
    init: RequestInit,
  ): Promise<unknown> {
    if (new URL(url).protocol !== 'https:')
      throw new Error('Provider requests require HTTPS');
    const mutating = init.method !== 'GET';
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new ProviderRequestError(
          provider,
          mutating && response.status >= 500,
          response.status,
        );
      const text = await response.text();
      if (text.length > 1_000_000)
        throw new ProviderRequestError(provider, mutating);
      if (!text) return null;
      return response.headers.get('content-type')?.includes('json')
        ? JSON.parse(text)
        : text;
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      throw new ProviderRequestError(provider, mutating);
    }
  }
}
