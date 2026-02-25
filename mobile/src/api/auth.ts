import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type { AuthResponse, LoginRequest, RegisterRequest, RegisterResponse, User } from '@/types/auth';

const MOCK_USERS: Array<User & { password: string }> = [
  {
    id: '1',
    email: 'admin@example.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
    phone: '+1 555 0101',
    avatarUrl: null,
    language: 'es',
    role: 'admin',
    isActive: true,
  },
  {
    id: '2',
    email: 'owner@example.com',
    password: 'owner123',
    firstName: 'Owner',
    lastName: 'User',
    phone: '+1 555 0102',
    avatarUrl: null,
    language: 'es',
    role: 'owner',
    isActive: true,
  },
];

export const authApi = {
  async login(payload: LoginRequest): Promise<AuthResponse> {
    if (IS_MOCK_MODE) {
      const user = MOCK_USERS.find((candidate) => candidate.email === payload.email && candidate.password === payload.password);
      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      const { password: _, ...safeUser } = user;
      return {
        accessToken: `mock-token-${safeUser.id}-${Date.now()}`,
        user: safeUser,
      };
    }

    return apiClient.post<AuthResponse>('/auth/login', payload);
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    if (IS_MOCK_MODE) {
      return {
        pendingApproval: true,
        userId: `${Date.now()}`,
        message: 'registration.pendingApproval',
      };
    }

    return apiClient.post<RegisterResponse>('/auth/register', payload);
  },
};
