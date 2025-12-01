const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
    token?: string;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<T> {
        const { token, ...fetchOptions } = options;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(fetchOptions.headers as Record<string, string>),
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...fetchOptions,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                message: response.statusText,
            }));
            throw new Error(error.message || 'API request failed');
        }

        return response.json();
    }

    async get<T>(endpoint: string, token?: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET', token });
    }

    async post<T>(endpoint: string, data: any, token?: string): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            token,
        });
    }

    async patch<T>(endpoint: string, data: any, token?: string): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data),
            token,
        });
    }

    async delete<T>(endpoint: string, token?: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE', token });
    }
}

export const apiClient = new ApiClient(API_URL);
