import type { Buyer, CreateBuyerInput, UpdateBuyerInput } from "@/types/buyer";
import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

const DELAY = 250;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BackendBuyer = Partial<Buyer> & {
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

const MOCK_BUYERS: Buyer[] = [];

const mapBuyer = (raw: BackendBuyer): Buyer => ({
  id: raw.id ?? "",
  userId: raw.userId ?? raw.user?.id ?? undefined,
  companyId: raw.companyId ?? undefined,
  interestedProfileId: raw.interestedProfileId ?? null,
  firstName: raw.firstName ?? raw.user?.firstName ?? "",
  lastName: raw.lastName ?? raw.user?.lastName ?? "",
  email: raw.email ?? raw.user?.email ?? null,
  phone: raw.phone ?? raw.user?.phone ?? null,
  dni: raw.dni ?? null,
  notes: raw.notes ?? null,
  createdAt: raw.createdAt ?? new Date().toISOString(),
  updatedAt: raw.updatedAt ?? new Date().toISOString(),
});

export const buyersApi = {
  getAll: async (filters?: {
    name?: string;
    email?: string;
    phone?: string;
    limit?: number;
  }): Promise<Buyer[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const term = filters?.name?.trim().toLowerCase() ?? "";
      return MOCK_BUYERS.filter((buyer) => {
        if (!term) {
          return true;
        }
        return `${buyer.firstName} ${buyer.lastName}`
          .toLowerCase()
          .includes(term);
      });
    }

    const token = getToken();
    const query = new URLSearchParams();
    if (filters?.name?.trim()) query.set("name", filters.name.trim());
    if (filters?.email?.trim()) query.set("email", filters.email.trim());
    if (filters?.phone?.trim()) query.set("phone", filters.phone.trim());
    if (filters?.limit) query.set("limit", String(filters.limit));

    const endpoint =
      query.toString().length > 0 ? `/buyers?${query.toString()}` : "/buyers";
    const result = await apiClient.get<
      | BackendBuyer[]
      | { data: BackendBuyer[]; total: number; page: number; limit: number }
    >(endpoint, token ?? undefined);

    return Array.isArray(result)
      ? result.map(mapBuyer)
      : result.data.map(mapBuyer);
  },

  getById: async (id: string): Promise<Buyer | null> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_BUYERS.find((buyer) => buyer.id === id) ?? null;
    }

    const token = getToken();
    try {
      const result = await apiClient.get<BackendBuyer>(
        `/buyers/${id}`,
        token ?? undefined,
      );
      return mapBuyer(result);
    } catch {
      return null;
    }
  },

  create: async (data: CreateBuyerInput): Promise<Buyer> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const created: Buyer = {
        id: `buyer-${Date.now()}`,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        dni: data.dni ?? null,
        notes: data.notes ?? null,
        interestedProfileId: data.interestedProfileId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_BUYERS.unshift(created);
      return created;
    }

    const token = getToken();
    const result = await apiClient.post<BackendBuyer>(
      "/buyers",
      data,
      token ?? undefined,
    );
    return mapBuyer(result);
  },

  update: async (id: string, data: UpdateBuyerInput): Promise<Buyer> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const current = MOCK_BUYERS.find((buyer) => buyer.id === id);
      if (!current) {
        throw new Error("Buyer not found");
      }
      const updated: Buyer = {
        ...current,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const index = MOCK_BUYERS.findIndex((buyer) => buyer.id === id);
      if (index >= 0) {
        MOCK_BUYERS[index] = updated;
      }
      return updated;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendBuyer>(
      `/buyers/${id}`,
      data,
      token ?? undefined,
    );
    return mapBuyer(result);
  },
};
