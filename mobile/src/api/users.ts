import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type { User } from '@/types/auth';

type UsersPage = {
  data: User[];
  total: number;
  page: number;
  limit: number;
};

let MOCK_USERS: User[] = [
  {
    id: '1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
    language: 'es',
  },
];

export type CreateManagedUserInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: User['role'];
  phone?: string;
};

export type UpdateManagedUserInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export type ResetUserPasswordResult = {
  message: string;
  temporaryPassword: string;
};

export const usersApi = {
  async list(page = 1, limit = 20): Promise<UsersPage> {
    if (IS_MOCK_MODE) {
      return {
        data: MOCK_USERS,
        total: MOCK_USERS.length,
        page,
        limit,
      };
    }

    return apiClient.get<UsersPage>(`/users?page=${page}&limit=${limit}`);
  },

  async getById(id: string): Promise<User | null> {
    if (IS_MOCK_MODE) {
      return MOCK_USERS.find((item) => item.id === id) ?? null;
    }

    try {
      return await apiClient.get<User>(`/users/${id}`);
    } catch {
      return null;
    }
  },

  async create(payload: CreateManagedUserInput): Promise<User> {
    if (IS_MOCK_MODE) {
      const created: User = {
        id: `user-${Date.now()}`,
        email: payload.email.trim().toLowerCase(),
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        phone: payload.phone?.trim() || null,
        role: payload.role,
        language: 'es',
        isActive: true,
      };
      MOCK_USERS.unshift(created);
      return created;
    }

    return apiClient.post<User>('/users', payload);
  },

  async update(id: string, payload: UpdateManagedUserInput): Promise<User> {
    if (IS_MOCK_MODE) {
      const index = MOCK_USERS.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('User not found');
      }

      const current = MOCK_USERS[index];
      const updated: User = {
        ...current,
        ...payload,
        email: payload.email?.trim().toLowerCase() ?? current.email,
        firstName: payload.firstName?.trim() ?? current.firstName,
        lastName: payload.lastName?.trim() ?? current.lastName,
        phone: payload.phone === undefined ? current.phone : payload.phone || null,
      };
      MOCK_USERS[index] = updated;
      return updated;
    }

    return apiClient.patch<User>(`/users/${id}`, payload);
  },

  async setActivation(id: string, isActive: boolean): Promise<User> {
    if (IS_MOCK_MODE) {
      const index = MOCK_USERS.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('User not found');
      }

      MOCK_USERS[index] = {
        ...MOCK_USERS[index],
        isActive,
      };
      return MOCK_USERS[index];
    }

    return apiClient.patch<User>(`/users/${id}/activation`, { isActive });
  },

  async resetPassword(id: string, newPassword?: string): Promise<ResetUserPasswordResult> {
    if (IS_MOCK_MODE) {
      return {
        message: 'Password changed successfully',
        temporaryPassword: newPassword?.trim() || 'temp-pass-1234',
      };
    }

    return apiClient.post<ResetUserPasswordResult>(`/users/${id}/reset-password`, { newPassword });
  },

  async delete(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_USERS = MOCK_USERS.filter((item) => item.id !== id);
      return;
    }

    await apiClient.delete(`/users/${id}`);
  },
};
