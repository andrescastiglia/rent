import { API_URL } from '@/api/env';
import { clearAuth, getToken } from '@/storage/auth-storage';
import { isTokenExpired } from '@/utils/jwt';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type SessionExpiredHandler = (() => void | Promise<void>) | null;

type RequestOptions = {
  method?: Method;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
};

let sessionExpiredHandler: SessionExpiredHandler = null;
let isHandlingSessionExpired = false;

export function setSessionExpiredHandler(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandler = handler;

  return () => {
    if (sessionExpiredHandler === handler) {
      sessionExpiredHandler = null;
    }
  };
}

async function handleSessionExpired(): Promise<void> {
  if (isHandlingSessionExpired) return;
  isHandlingSessionExpired = true;

  try {
    await clearAuth();
    if (sessionExpiredHandler) {
      await sessionExpiredHandler();
    }
  } finally {
    isHandlingSessionExpired = false;
  }
}

class ApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const token = options.token ?? (await getToken());

    if (token && isTokenExpired(token)) {
      await handleSessionExpired();
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

    if (response.status === 401 && token) {
      await handleSessionExpired();
      throw new Error('SESSION_EXPIRED');
    }

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
