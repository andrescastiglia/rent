import { isTokenExpired } from "@/lib/auth";
import { forceLogout } from "@/lib/forceLogout";
import { emitToast } from "@/lib/toastBus";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Mock mode for unit tests (NODE_ENV === 'test'), CI environment (no backend available), or explicit mock mode
export const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

// Mock authentication data for development/testing
const MOCK_USERS = [
  {
    id: "1",
    email: "admin@example.com",
    password: "admin123",
    firstName: "Admin",
    lastName: "User",
    name: "Admin User",
    role: "admin",
    isActive: true,
  },
  {
    id: "2",
    email: "user@example.com",
    password: "user123",
    firstName: "Test",
    lastName: "User",
    name: "Test User",
    role: "owner",
    isActive: true,
  },
];

// Helper to simulate API delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock dashboard data
const MOCK_DASHBOARD_STATS = {
  totalProperties: 5,
  totalTenants: 12,
  activeLeases: 8,
  monthlyIncome: 45000,
  currencyCode: "ARS",
  totalPayments: 24,
  totalInvoices: 32,
};

// Mock GET handler for protected endpoints
async function handleMockGet(endpoint: string): Promise<any> {
  await delay(200);

  if (endpoint === "/dashboard/stats") {
    return MOCK_DASHBOARD_STATS;
  }

  return null;
}

// Mock auth handler
async function handleMockAuth(endpoint: string, data: any): Promise<any> {
  await delay(300); // Simulate network delay

  if (endpoint === "/auth/login") {
    const user = MOCK_USERS.find(
      (u) => u.email === data.email && u.password === data.password,
    );
    if (!user) {
      throw new Error("Credenciales inválidas");
    }
    const { password: _, ...userWithoutPassword } = user;
    return {
      accessToken: `mock-token-${user.id}-${Date.now()}`,
      user: userWithoutPassword,
    };
  }

  if (endpoint === "/auth/register") {
    const existingUser = MOCK_USERS.find((u) => u.email === data.email);
    if (existingUser) {
      throw new Error("El email ya está registrado");
    }
    const newUser = {
      id: String(MOCK_USERS.length + 1),
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      name: `${data.firstName} ${data.lastName}`,
      role: "owner" as const,
      isActive: true,
    };
    // Add user to mock database so login works
    MOCK_USERS.push(newUser);

    const { password: _, ...userWithoutPassword } = newUser;
    return {
      accessToken: `mock-token-${newUser.id}-${Date.now()}`,
      user: userWithoutPassword,
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
    options: RequestOptions = {},
  ): Promise<T> {
    const { token, ...fetchOptions } = options;

    // Auth guard: if token is expired/invalid, force logoff and do NOT attempt request.
    // Skip entirely in mock mode.
    if (!IS_MOCK_MODE && token && isTokenExpired(token)) {
      forceLogout();
      throw new Error("SESSION_EXPIRED");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401) {
      // Spec: 401 -> toast (internationalized) WITHOUT logoff.
      emitToast({
        kind: "error",
        namespace: "auth",
        key: "errors.unauthorized",
      });
    }

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(error.message || "API request failed");
    }

    return response.json();
  }

  async get<T>(endpoint: string, token?: string): Promise<T> {
    // Use mock for certain endpoints in mock mode
    if (IS_MOCK_MODE) {
      const mockResult = await handleMockGet(endpoint);
      if (mockResult !== null) {
        return mockResult as T;
      }
    }
    return this.request<T>(endpoint, { method: "GET", token });
  }

  async post<T>(endpoint: string, data: any, token?: string): Promise<T> {
    // Use mock for auth endpoints only in development
    if (IS_MOCK_MODE && endpoint.startsWith("/auth/")) {
      return handleMockAuth(endpoint, data) as Promise<T>;
    }
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
      token,
    });
  }

  async patch<T>(endpoint: string, data: any, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    });
  }

  async delete<T>(endpoint: string, token?: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE", token });
  }

  async upload<T>(
    endpoint: string,
    formData: FormData,
    token?: string,
  ): Promise<T> {
    // Auth guard: skip in mock mode
    if (!IS_MOCK_MODE && token && isTokenExpired(token)) {
      forceLogout();
      throw new Error("SESSION_EXPIRED");
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (response.status === 401) {
      emitToast({
        kind: "error",
        namespace: "auth",
        key: "errors.unauthorized",
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));
      throw new Error(error.message || "Upload failed");
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_URL);
