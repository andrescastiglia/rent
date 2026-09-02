import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import { encode as base64Encode } from 'base-64';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  User,
} from '@/types/auth';

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

function createMockAccessToken(user: User): string {
  const payload = base64Encode(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');

  return `mock.${payload}.signature`;
}

export const authApi = {
  async login(payload: LoginRequest): Promise<AuthResponse> {
    if (IS_MOCK_MODE) {
      const user = MOCK_USERS.find(
        (candidate) =>
          candidate.email === payload.email &&
          candidate.password === payload.password,
      );
      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      const { password: _, ...safeUser } = user;
      return {
        accessToken: createMockAccessToken(safeUser),
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
