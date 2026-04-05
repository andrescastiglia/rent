import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';

export type StaffSpecialization =
  | 'maintenance'
  | 'cleaning'
  | 'security'
  | 'administration'
  | 'accounting'
  | 'legal'
  | 'other';

export type Staff = {
  id: string;
  userId: string;
  companyId: string;
  specialization: StaffSpecialization;
  hourlyRate?: number;
  currency: string;
  serviceAreas?: string[];
  certifications?: string[];
  notes?: string;
  rating?: number;
  totalJobs: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
  };
};

export type CreateStaffInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  specialization: StaffSpecialization;
  hourlyRate?: number;
  currency?: string;
  serviceAreas?: string[];
  certifications?: string[];
  notes?: string;
};

export type UpdateStaffInput = Partial<CreateStaffInput>;

type BackendStaff = {
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

const toIso = (value?: string | Date): string =>
  value ? new Date(value).toISOString() : new Date().toISOString();

const mapStaff = (raw: BackendStaff): Staff => ({
  id: raw.id,
  userId: raw.userId,
  companyId: raw.companyId,
  specialization: raw.specialization,
  hourlyRate: raw.hourlyRate ?? undefined,
  currency: raw.currency ?? 'USD',
  serviceAreas: raw.serviceAreas ?? [],
  certifications: raw.certifications ?? [],
  notes: raw.notes ?? undefined,
  rating: raw.rating ?? undefined,
  totalJobs: raw.totalJobs ?? 0,
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
  deletedAt: raw.deletedAt ? toIso(raw.deletedAt) : undefined,
  user: {
    id: raw.user?.id ?? raw.userId,
    firstName: raw.user?.firstName ?? undefined,
    lastName: raw.user?.lastName ?? undefined,
    email: raw.user?.email ?? undefined,
    phone: raw.user?.phone ?? undefined,
    isActive: raw.user?.isActive ?? true,
  },
});

let MOCK_STAFF: Staff[] = [
  {
    id: 'mock-staff-1',
    userId: 'mock-user-1',
    companyId: 'mock-company-1',
    specialization: 'maintenance',
    hourlyRate: 25,
    currency: 'USD',
    serviceAreas: [],
    certifications: [],
    totalJobs: 12,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: {
      id: 'mock-user-1',
      firstName: 'Carlos',
      lastName: 'López',
      email: 'carlos.lopez@example.com',
      isActive: true,
    },
  },
];

export const staffApi = {
  async getAll(params?: {
    specialization?: string;
    search?: string;
  }): Promise<Staff[]> {
    if (IS_MOCK_MODE) {
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
            `${s.user.firstName ?? ''} ${s.user.lastName ?? ''}`.toLowerCase();
          return (
            fullName.includes(term) ||
            (s.user.email ?? '').toLowerCase().includes(term)
          );
        });
      }
      return result;
    }

    const queryParams = new URLSearchParams();
    if (params?.specialization)
      queryParams.append('specialization', params.specialization);
    if (params?.search) queryParams.append('search', params.search);

    const endpoint = queryParams.toString()
      ? `/staff?${queryParams.toString()}`
      : '/staff';
    const result = await apiClient.get<
      BackendStaff[] | { data: BackendStaff[] }
    >(endpoint);
    return Array.isArray(result)
      ? result.map(mapStaff)
      : result.data.map(mapStaff);
  },

  async getOne(id: string): Promise<Staff> {
    if (IS_MOCK_MODE) {
      const found = MOCK_STAFF.find((s) => s.id === id);
      if (!found) throw new Error('Staff not found');
      return found;
    }

    const result = await apiClient.get<BackendStaff>(`/staff/${id}`);
    return mapStaff(result);
  },

  async create(payload: CreateStaffInput): Promise<Staff> {
    if (IS_MOCK_MODE) {
      const created: Staff = {
        id: `mock-staff-${Date.now()}`,
        userId: `mock-user-${Date.now()}`,
        companyId: 'mock-company-1',
        specialization: payload.specialization,
        hourlyRate: payload.hourlyRate,
        currency: payload.currency ?? 'USD',
        serviceAreas: payload.serviceAreas ?? [],
        certifications: payload.certifications ?? [],
        notes: payload.notes,
        totalJobs: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: {
          id: `mock-user-${Date.now()}`,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          phone: payload.phone,
          isActive: true,
        },
      };
      MOCK_STAFF = [created, ...MOCK_STAFF];
      return created;
    }

    const result = await apiClient.post<BackendStaff>('/staff', payload);
    return mapStaff(result);
  },

  async update(id: string, payload: UpdateStaffInput): Promise<Staff> {
    if (IS_MOCK_MODE) {
      const index = MOCK_STAFF.findIndex((s) => s.id === id);
      if (index < 0) throw new Error('Staff not found');
      const existing = MOCK_STAFF[index];
      const updated: Staff = {
        ...existing,
        specialization: payload.specialization ?? existing.specialization,
        hourlyRate: payload.hourlyRate ?? existing.hourlyRate,
        currency: payload.currency ?? existing.currency,
        serviceAreas: payload.serviceAreas ?? existing.serviceAreas,
        certifications: payload.certifications ?? existing.certifications,
        notes: payload.notes ?? existing.notes,
        updatedAt: new Date().toISOString(),
        user: {
          ...existing.user,
          firstName: payload.firstName ?? existing.user.firstName,
          lastName: payload.lastName ?? existing.user.lastName,
          email: payload.email ?? existing.user.email,
          phone: payload.phone ?? existing.user.phone,
        },
      };
      MOCK_STAFF[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<BackendStaff>(`/staff/${id}`, payload);
    return mapStaff(result);
  },

  async remove(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
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

    await apiClient.delete(`/staff/${id}`);
  },

  async activate(id: string): Promise<Staff> {
    if (IS_MOCK_MODE) {
      const index = MOCK_STAFF.findIndex((s) => s.id === id);
      if (index < 0) throw new Error('Staff not found');
      MOCK_STAFF[index] = {
        ...MOCK_STAFF[index],
        deletedAt: undefined,
        updatedAt: new Date().toISOString(),
        user: { ...MOCK_STAFF[index].user, isActive: true },
      };
      return MOCK_STAFF[index];
    }

    const result = await apiClient.patch<BackendStaff>(
      `/staff/${id}/activate`,
      {},
    );
    return mapStaff(result);
  },
};
