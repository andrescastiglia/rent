import { API_URL } from '@/api/env';
import { clearAuth, getToken } from '@/storage/auth-storage';
import { isTokenExpired } from '@/utils/jwt';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type RequestOptions = {
  method?: Method;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
};

class ApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const token = options.token ?? (await getToken());

    if (token && isTokenExpired(token)) {
      await clearAuth();
      throw new Error('SESSION_EXPIRED');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const fallback = response.statusText || 'API request failed';
      const payload = await response.json().catch(() => ({ message: fallback }));
      throw new Error(payload.message ?? fallback);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, token?: string | null): Promise<T> {
    return this.request<T>(path, { method: 'GET', token });
  }

  post<T>(path: string, body: unknown, token?: string | null): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, token });
  }

  patch<T>(path: string, body: unknown, token?: string | null): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, token });
  }

  put<T>(path: string, body: unknown, token?: string | null): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, token });
  }

  delete<T>(path: string, token?: string | null): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', token });
  }
}

export const apiClient = new ApiClient(API_URL);
