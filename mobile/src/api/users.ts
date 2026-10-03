import type { ContactInput } from '../../../shared/contact-data';
import type { CreateUserDto, UpdateUserDto } from '@/generated/openapi';
import { ApiError, apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type { User } from '@/types/auth';

type UsersPage = {
  data: User[];
  total: number;
  page: number;
  limit: number;
};

let mockTemporaryCredentialCounter = 0;
const createMockTemporaryCredential = () =>
  `tmp-${Date.now().toString(36)}-${(++mockTemporaryCredentialCounter).toString(36).padStart(4, '0')}`;

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

export type CreateManagedUserInput = ContactInput &
  Pick<
    CreateUserDto,
    'email' | 'password' | 'firstName' | 'lastName' | 'role' | 'roles' | 'phone'
  >;
export type UpdateManagedUserInput = ContactInput &
  Pick<
    UpdateUserDto,
    'email' | 'firstName' | 'lastName' | 'phone' | 'role' | 'roles'
  >;

export type ResetUserPasswordResult = {
  message: string;
  temporaryPassword: string;
};

export const usersApi = {
  async getProfile(): Promise<User> {
    if (IS_MOCK_MODE) {
      return MOCK_USERS[0];
    }
    return apiClient.get<User>('/users/profile/me');
  },

  async list(page = 1, limit = 20, search = ''): Promise<UsersPage> {
    if (IS_MOCK_MODE) {
      return {
        data: MOCK_USERS.filter((user) =>
          `${user.firstName} ${user.lastName} ${user.email}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ).slice((page - 1) * limit, page * limit),
        total: MOCK_USERS.filter((user) =>
          `${user.firstName} ${user.lastName} ${user.email}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ).length,
        page,
        limit,
      };
    }

    return apiClient.get<UsersPage>(
      `/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
    );
  },

  async getById(id: string): Promise<User | null> {
    if (IS_MOCK_MODE) {
      return MOCK_USERS.find((item) => item.id === id) ?? null;
    }

    try {
      return await apiClient.get<User>(`/users/${id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
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
        roles: payload.roles?.length ? payload.roles : [payload.role],
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
        phone:
          payload.phone === undefined ? current.phone : payload.phone || null,
        roles: payload.roles?.length
          ? Array.from(
              new Set([payload.role ?? current.role, ...payload.roles]),
            )
          : current.roles,
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

  async resetPassword(
    id: string,
    newPassword?: string,
  ): Promise<ResetUserPasswordResult> {
    if (IS_MOCK_MODE) {
      return {
        message: 'Password changed successfully',
        temporaryPassword:
          newPassword?.trim() || createMockTemporaryCredential(),
      };
    }

    return apiClient.post<ResetUserPasswordResult>(
      `/users/${id}/reset-password`,
      { newPassword },
    );
  },

  async delete(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_USERS = MOCK_USERS.filter((item) => item.id !== id);
      return;
    }

    await apiClient.delete(`/users/${id}`);
  },
};
