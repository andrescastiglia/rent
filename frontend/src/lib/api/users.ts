import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken, getUser, setUser } from "../auth";
import type { User } from "@/types/auth";

const DELAY = 250;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type UpdateMyProfileInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  language?: "es" | "en" | "pt";
  avatarUrl?: string | null;
};

type BackendUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  language?: string;
  role: User["role"];
  isActive?: boolean;
  companyId?: string;
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type UsersListResponse = {
  data: BackendUser[];
  total: number;
  page: number;
  limit: number;
};

export type UsersPage = {
  data: User[];
  total: number;
  page: number;
  limit: number;
};

export type CreateManagedUserInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: User["role"];
  phone?: string;
};

export type UpdateManagedUserInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: User["role"];
  phone?: string;
};

export type ResetUserPasswordResult = {
  message: string;
  temporaryPassword: string;
};

const normalizeLanguage = (
  value: string | undefined,
): User["language"] | undefined => {
  if (value === "es" || value === "en" || value === "pt") {
    return value;
  }
  return undefined;
};

const mapUser = (raw: BackendUser): User => ({
  id: raw.id,
  email: raw.email,
  firstName: raw.firstName,
  lastName: raw.lastName,
  phone: raw.phone ?? null,
  avatarUrl: raw.avatarUrl ?? null,
  language: normalizeLanguage(raw.language),
  role: raw.role,
  isActive: raw.isActive,
  companyId: raw.companyId,
});

let MOCK_MANAGED_USERS: User[] = [
  {
    id: "1",
    email: "admin@example.com",
    firstName: "Admin",
    lastName: "User",
    phone: "+1 555 0101",
    avatarUrl: null,
    language: "es",
    role: "admin",
    isActive: true,
  },
];

const getMockUser = (): User => {
  const stored = getUser() as User | null;
  if (stored) {
    return {
      ...stored,
      phone: stored.phone ?? null,
      avatarUrl: stored.avatarUrl ?? null,
      language: normalizeLanguage(stored.language) ?? "es",
    };
  }

  return {
    id: "1",
    email: "admin@example.com",
    firstName: "Admin",
    lastName: "User",
    phone: "+1 555 0101",
    avatarUrl: null,
    language: "es",
    role: "admin",
    isActive: true,
  };
};

export const usersApi = {
  getMyProfile: async (): Promise<User> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return getMockUser();
    }

    const token = getToken();
    const result = await apiClient.get<BackendUser>(
      "/users/profile/me",
      token ?? undefined,
    );
    return mapUser(result);
  },

  updateMyProfile: async (payload: UpdateMyProfileInput): Promise<User> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const current = getMockUser();
      const merged: User = {
        ...current,
        ...payload,
        avatarUrl:
          payload.avatarUrl === undefined
            ? current.avatarUrl
            : payload.avatarUrl,
        language: payload.language ?? current.language ?? "es",
      };
      setUser(merged);
      return merged;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendUser>(
      "/users/profile/me",
      payload,
      token ?? undefined,
    );
    return mapUser(result);
  },

  changeMyPassword: async (payload: ChangePasswordInput): Promise<void> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return;
    }

    const token = getToken();
    await apiClient.post<{ message: string }>(
      "/users/profile/change-password",
      payload,
      token ?? undefined,
    );
  },

  list: async (page = 1, limit = 20): Promise<UsersPage> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const start = (page - 1) * limit;
      const data = MOCK_MANAGED_USERS.slice(start, start + limit);
      return {
        data,
        total: MOCK_MANAGED_USERS.length,
        page,
        limit,
      };
    }

    const token = getToken();
    const result = await apiClient.get<UsersListResponse>(
      `/users?page=${page}&limit=${limit}`,
      token ?? undefined,
    );
    return {
      ...result,
      data: result.data.map(mapUser),
    };
  },

  create: async (payload: CreateManagedUserInput): Promise<User> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const created: User = {
        id: `mock-user-${Date.now()}`,
        email: payload.email.trim().toLowerCase(),
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        phone: payload.phone?.trim() || null,
        avatarUrl: null,
        language: "es",
        role: payload.role,
        isActive: true,
      };
      MOCK_MANAGED_USERS = [created, ...MOCK_MANAGED_USERS];
      return created;
    }

    const token = getToken();
    const result = await apiClient.post<BackendUser>(
      "/users",
      payload,
      token ?? undefined,
    );
    return mapUser(result);
  },

  update: async (
    id: string,
    payload: UpdateManagedUserInput,
  ): Promise<User> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_MANAGED_USERS.findIndex((user) => user.id === id);
      if (index === -1) {
        throw new Error("User not found");
      }
      const current = MOCK_MANAGED_USERS[index];
      const next: User = {
        ...current,
        ...payload,
        email: payload.email?.trim().toLowerCase() ?? current.email,
        firstName: payload.firstName?.trim() ?? current.firstName,
        lastName: payload.lastName?.trim() ?? current.lastName,
        phone:
          payload.phone === undefined ? current.phone : payload.phone || null,
      };
      MOCK_MANAGED_USERS[index] = next;
      return next;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendUser>(
      `/users/${id}`,
      payload,
      token ?? undefined,
    );
    return mapUser(result);
  },

  setActivation: async (id: string, isActive: boolean): Promise<User> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_MANAGED_USERS.findIndex((user) => user.id === id);
      if (index === -1) {
        throw new Error("User not found");
      }
      MOCK_MANAGED_USERS[index] = {
        ...MOCK_MANAGED_USERS[index],
        isActive,
      };
      return MOCK_MANAGED_USERS[index];
    }

    const token = getToken();
    const result = await apiClient.patch<BackendUser>(
      `/users/${id}/activation`,
      { isActive },
      token ?? undefined,
    );
    return mapUser(result);
  },

  resetPassword: async (
    id: string,
    newPassword?: string,
  ): Promise<ResetUserPasswordResult> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return {
        message: "Password changed successfully",
        temporaryPassword: newPassword?.trim() || "temp-pass-1234",
      };
    }

    const token = getToken();
    return apiClient.post<ResetUserPasswordResult>(
      `/users/${id}/reset-password`,
      { newPassword },
      token ?? undefined,
    );
  },
};
