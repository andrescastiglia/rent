const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Mock authentication data for development/testing
const MOCK_USERS = [
    {
        id: '1',
        email: 'admin@example.com',
        password: 'admin123',
        firstName: 'Admin',
        lastName: 'User',
        name: 'Admin User',
        role: 'ADMIN',
    },
    {
        id: '2',
        email: 'user@example.com',
        password: 'user123',
        firstName: 'Test',
        lastName: 'User',
        name: 'Test User',
        role: 'USER',
    },
];

// Helper to simulate API delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock auth handler
async function handleMockAuth(endpoint: string, data: any): Promise<any> {
    await delay(300); // Simulate network delay

    if (endpoint === '/auth/login') {
        const user = MOCK_USERS.find(
            (u) => u.email === data.email && u.password === data.password
        );
        if (!user) {
            throw new Error('Credenciales inválidas');
        }
        const { password: _, ...userWithoutPassword } = user;
        return {
            accessToken: `mock-token-${user.id}-${Date.now()}`,
            user: userWithoutPassword,
        };
    }

    if (endpoint === '/auth/register') {
        const existingUser = MOCK_USERS.find((u) => u.email === data.email);
        if (existingUser) {
            throw new Error('El email ya está registrado');
        }
        const newUser = {
            id: String(MOCK_USERS.length + 1),
            email: data.email,
            name: data.name,
            role: 'USER',
        };
        return {
            accessToken: `mock-token-${newUser.id}-${Date.now()}`,
            user: newUser,
        };
    }

    return null;
}

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
        // Use mock for auth endpoints
        if (endpoint.startsWith('/auth/')) {
            return handleMockAuth(endpoint, data) as Promise<T>;
        }
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
