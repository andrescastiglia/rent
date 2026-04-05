import type {
  Staff,
  StaffSpecialization,
  CreateStaffInput,
  UpdateStaffInput,
} from "@/types/staff";
import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

type BackendStaffLike = {
  id: string;
  userId: string;
  companyId: string;
  specialization: StaffSpecialization;
  hourlyRate?: number | null;
  currency?: string | null;
  serviceAreas?: string[] | null;
  certifications?: string[] | null;
  notes?: string | null;
  rating?: number | null;
  totalJobs?: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  deletedAt?: string | Date | null;
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    isActive?: boolean | null;
  } | null;
};

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldUseMock = (): boolean =>
  IS_MOCK_MODE || (getToken()?.startsWith("mock-token-") ?? false);

let MOCK_STAFF: Staff[] = [
  {
    id: "mock-staff-1",
    userId: "mock-user-1",
    companyId: "mock-company-1",
    specialization: "maintenance",
    hourlyRate: 25,
    currency: "USD",
    serviceAreas: ["Zone A", "Zone B"],
    certifications: [],
    notes: "",
    rating: 4.5,
    totalJobs: 12,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: {
      id: "mock-user-1",
      firstName: "Carlos",
      lastName: "López",
      email: "carlos.lopez@example.com",
      phone: "+54 9 11 1111-1111",
      isActive: true,
    },
  },
  {
    id: "mock-staff-2",
    userId: "mock-user-2",
    companyId: "mock-company-1",
    specialization: "cleaning",
    hourlyRate: 18,
    currency: "USD",
    serviceAreas: [],
    certifications: [],
    notes: "",
    rating: undefined,
    totalJobs: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: {
      id: "mock-user-2",
      firstName: "Ana",
      lastName: "Martínez",
      email: "ana.martinez@example.com",
      phone: "+54 9 11 2222-2222",
      isActive: false,
    },
  },
];

const mapBackendStaffToStaff = (raw: BackendStaffLike): Staff => ({
  id: raw.id,
  userId: raw.userId,
  companyId: raw.companyId,
  specialization: raw.specialization,
  hourlyRate: raw.hourlyRate ?? undefined,
  currency: raw.currency ?? "USD",
  serviceAreas: raw.serviceAreas ?? [],
  certifications: raw.certifications ?? [],
  notes: raw.notes ?? undefined,
  rating: raw.rating ?? undefined,
  totalJobs: raw.totalJobs ?? 0,
  createdAt: raw.createdAt
    ? new Date(raw.createdAt).toISOString()
    : new Date().toISOString(),
  updatedAt: raw.updatedAt
    ? new Date(raw.updatedAt).toISOString()
    : new Date().toISOString(),
  deletedAt: raw.deletedAt ? new Date(raw.deletedAt).toISOString() : undefined,
  user: {
    id: raw.user?.id ?? raw.userId,
    firstName: raw.user?.firstName ?? undefined,
    lastName: raw.user?.lastName ?? undefined,
    email: raw.user?.email ?? undefined,
    phone: raw.user?.phone ?? undefined,
    isActive: raw.user?.isActive ?? true,
  },
});

export const staffApi = {
  getAll: async (params?: {
    specialization?: string;
    search?: string;
  }): Promise<Staff[]> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      let result = [...MOCK_STAFF];
      if (params?.specialization) {
        result = result.filter(
          (s) => s.specialization === params.specialization,
        );
      }
      if (params?.search) {
        const term = params.search.toLowerCase();
        result = result.filter((s) => {
          const fullName =
            `${s.user.firstName ?? ""} ${s.user.lastName ?? ""}`.toLowerCase();
          return (
            fullName.includes(term) ||
            (s.user.email ?? "").toLowerCase().includes(term)
          );
        });
      }
      return result;
    }

    const token = getToken();
    const queryParams = new URLSearchParams();
    if (params?.specialization)
      queryParams.append("specialization", params.specialization);
    if (params?.search) queryParams.append("search", params.search);

    const endpoint =
      queryParams.toString().length > 0
        ? `/staff?${queryParams.toString()}`
        : "/staff";
    const result = await apiClient.get<
      BackendStaffLike[] | { data: BackendStaffLike[] }
    >(endpoint, token ?? undefined);
    const list = Array.isArray(result) ? result : result.data;
    return list.map(mapBackendStaffToStaff);
  },

  getOne: async (id: string): Promise<Staff> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const found = MOCK_STAFF.find((s) => s.id === id);
      if (!found) throw new Error("Staff not found");
      return found;
    }

    const token = getToken();
    const result = await apiClient.get<BackendStaffLike>(
      `/staff/${id}`,
      token ?? undefined,
    );
    return mapBackendStaffToStaff(result);
  },

  create: async (data: CreateStaffInput): Promise<Staff> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const newStaff: Staff = {
        id: `mock-staff-${crypto.randomUUID().substring(0, 8)}`,
        userId: `mock-user-${crypto.randomUUID().substring(0, 8)}`,
        companyId: "mock-company-1",
        specialization: data.specialization,
        hourlyRate: data.hourlyRate,
        currency: data.currency ?? "USD",
        serviceAreas: data.serviceAreas ?? [],
        certifications: data.certifications ?? [],
        notes: data.notes,
        rating: undefined,
        totalJobs: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: {
          id: `mock-user-${crypto.randomUUID().substring(0, 8)}`,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          isActive: true,
        },
      };
      MOCK_STAFF = [newStaff, ...MOCK_STAFF];
      return newStaff;
    }

    const token = getToken();
    const result = await apiClient.post<BackendStaffLike>(
      "/staff",
      data,
      token ?? undefined,
    );
    return mapBackendStaffToStaff(result);
  },

  update: async (id: string, data: UpdateStaffInput): Promise<Staff> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const index = MOCK_STAFF.findIndex((s) => s.id === id);
      if (index === -1) throw new Error("Staff not found");
      const existing = MOCK_STAFF[index];
      const updated: Staff = {
        ...existing,
        specialization: data.specialization ?? existing.specialization,
        hourlyRate: data.hourlyRate ?? existing.hourlyRate,
        currency: data.currency ?? existing.currency,
        serviceAreas: data.serviceAreas ?? existing.serviceAreas,
        certifications: data.certifications ?? existing.certifications,
        notes: data.notes ?? existing.notes,
        updatedAt: new Date().toISOString(),
        user: {
          ...existing.user,
          firstName: data.firstName ?? existing.user.firstName,
          lastName: data.lastName ?? existing.user.lastName,
          email: data.email ?? existing.user.email,
          phone: data.phone ?? existing.user.phone,
        },
      };
      MOCK_STAFF[index] = updated;
      return updated;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendStaffLike>(
      `/staff/${id}`,
      data,
      token ?? undefined,
    );
    return mapBackendStaffToStaff(result);
  },

  remove: async (id: string): Promise<void> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const index = MOCK_STAFF.findIndex((s) => s.id === id);
      if (index !== -1) {
        MOCK_STAFF[index] = {
          ...MOCK_STAFF[index],
          deletedAt: new Date().toISOString(),
          user: { ...MOCK_STAFF[index].user, isActive: false },
        };
      }
      return;
    }

    const token = getToken();
    await apiClient.delete(`/staff/${id}`, token ?? undefined);
  },

  activate: async (id: string): Promise<Staff> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const index = MOCK_STAFF.findIndex((s) => s.id === id);
      if (index === -1) throw new Error("Staff not found");
      MOCK_STAFF[index] = {
        ...MOCK_STAFF[index],
        deletedAt: undefined,
        updatedAt: new Date().toISOString(),
        user: { ...MOCK_STAFF[index].user, isActive: true },
      };
      return MOCK_STAFF[index];
    }

    const token = getToken();
    const result = await apiClient.patch<BackendStaffLike>(
      `/staff/${id}/activate`,
      {},
      token ?? undefined,
    );
    return mapBackendStaffToStaff(result);
  },
};
