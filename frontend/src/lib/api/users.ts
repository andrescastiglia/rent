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
};
