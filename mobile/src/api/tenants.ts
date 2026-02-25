import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type {
  CreateTenantInput,
  Tenant,
  TenantActivity,
  TenantActivityStatus,
  TenantActivityType,
  TenantStatus,
  UpdateTenantInput,
} from '@/types/tenant';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

type BackendTenant = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dni?: string | null;
  isActive?: boolean | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    isActive?: boolean | null;
  } | null;
};

type TenantFilters = {
  name?: string;
  dni?: string;
  email?: string;
  page?: number;
  limit?: number;
};

type BackendTenantActivity = {
  id: string;
  tenantId?: string;
  type: TenantActivityType;
  status: TenantActivityStatus;
  subject: string;
  body?: string | null;
  dueAt?: string | Date | null;
  completedAt?: string | Date | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

let MOCK_TENANTS: Tenant[] = [
  {
    id: '1',
    firstName: 'Juan',
    lastName: 'Perez',
    email: 'juan@example.com',
    phone: '+54 9 11 1234-5678',
    dni: '12345678',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const toIso = (value?: string | Date): string => (value ? new Date(value).toISOString() : new Date().toISOString());
const toIsoNullable = (value?: string | Date | null): string | null => (value ? new Date(value).toISOString() : null);

const statusFromIsActive = (isActive?: boolean | null): TenantStatus => (isActive ?? true ? 'ACTIVE' : 'INACTIVE');

const mapTenant = (raw: BackendTenant): Tenant => {
  const user = raw.user ?? null;
  return {
    id: raw.id,
    firstName: raw.firstName ?? user?.firstName ?? '',
    lastName: raw.lastName ?? user?.lastName ?? '',
    email: raw.email ?? user?.email ?? '',
    phone: raw.phone ?? user?.phone ?? '',
    dni: raw.dni ?? '',
    status: statusFromIsActive(raw.isActive ?? user?.isActive),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
};

const mapTenantActivity = (raw: BackendTenantActivity): TenantActivity => ({
  id: raw.id,
  tenantId: raw.tenantId ?? '',
  type: raw.type,
  status: raw.status,
  subject: raw.subject,
  body: raw.body ?? null,
  dueAt: toIsoNullable(raw.dueAt),
  completedAt: toIsoNullable(raw.completedAt),
  metadata: raw.metadata ?? {},
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const toCreatePayload = (value: CreateTenantInput) => ({
  firstName: value.firstName,
  lastName: value.lastName,
  email: value.email,
  phone: value.phone,
  dni: value.dni,
  cuil: value.cuil,
  dateOfBirth: value.dateOfBirth,
  nationality: value.nationality,
  status: value.status,
  address: value.address,
  occupation: value.occupation,
  employer: value.employer,
  monthlyIncome: value.monthlyIncome,
  employmentStatus: value.employmentStatus,
  emergencyContactName: value.emergencyContactName,
  emergencyContactPhone: value.emergencyContactPhone,
  emergencyContactRelationship: value.emergencyContactRelationship,
  creditScore: value.creditScore,
  notes: value.notes,
});

const toUpdatePayload = (value: UpdateTenantInput) => ({
  ...toCreatePayload({
    firstName: value.firstName ?? '',
    lastName: value.lastName ?? '',
    email: value.email ?? '',
    phone: value.phone ?? '',
    dni: value.dni ?? '',
    status: value.status ?? 'ACTIVE',
    cuil: value.cuil,
    dateOfBirth: value.dateOfBirth,
    nationality: value.nationality,
    address: value.address,
    occupation: value.occupation,
    employer: value.employer,
    monthlyIncome: value.monthlyIncome,
    employmentStatus: value.employmentStatus,
    emergencyContactName: value.emergencyContactName,
    emergencyContactPhone: value.emergencyContactPhone,
    emergencyContactRelationship: value.emergencyContactRelationship,
    creditScore: value.creditScore,
    notes: value.notes,
  }),
});

export const tenantsApi = {
  async getAll(filters?: TenantFilters): Promise<Tenant[]> {
    if (IS_MOCK_MODE) {
      if (!filters?.name) {
        return [...MOCK_TENANTS];
      }

      const needle = filters.name.trim().toLowerCase();
      return MOCK_TENANTS.filter((item) =>
        `${item.firstName} ${item.lastName} ${item.email} ${item.phone}`.toLowerCase().includes(needle),
      );
    }

    const queryParams = new URLSearchParams();
    if (filters?.name) queryParams.append('name', filters.name);
    if (filters?.dni) queryParams.append('dni', filters.dni);
    if (filters?.email) queryParams.append('email', filters.email);
    if (filters?.page) queryParams.append('page', String(filters.page));
    if (filters?.limit) queryParams.append('limit', String(filters.limit));

    const endpoint = queryParams.toString() ? `/tenants?${queryParams.toString()}` : '/tenants';
    const result = await apiClient.get<BackendTenant[] | PaginatedResponse<BackendTenant>>(endpoint);
    return Array.isArray(result) ? result.map(mapTenant) : result.data.map(mapTenant);
  },

  async getById(id: string): Promise<Tenant | null> {
    if (IS_MOCK_MODE) {
      return MOCK_TENANTS.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<BackendTenant>(`/tenants/${id}`);
      return mapTenant(result);
    } catch {
      return null;
    }
  },

  async create(payload: CreateTenantInput): Promise<Tenant> {
    if (IS_MOCK_MODE) {
      const created: Tenant = {
        id: `tenant-${Date.now()}`,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TENANTS = [created, ...MOCK_TENANTS];
      return created;
    }

    const result = await apiClient.post<BackendTenant>('/tenants', toCreatePayload(payload));
    return mapTenant(result);
  },

  async update(id: string, payload: UpdateTenantInput): Promise<Tenant> {
    if (IS_MOCK_MODE) {
      const index = MOCK_TENANTS.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('Tenant not found');
      }

      const updated: Tenant = {
        ...MOCK_TENANTS[index],
        ...payload,
        updatedAt: new Date().toISOString(),
      };

      MOCK_TENANTS[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<BackendTenant>(`/tenants/${id}`, toUpdatePayload(payload));
    return mapTenant(result);
  },

  async delete(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_TENANTS = MOCK_TENANTS.filter((item) => item.id !== id);
      return;
    }

    await apiClient.delete(`/tenants/${id}`);
  },

  async createActivity(
    tenantId: string,
    payload: {
      type: TenantActivityType;
      subject: string;
      body?: string;
      dueAt?: string;
      status?: TenantActivityStatus;
    },
  ): Promise<TenantActivity> {
    if (IS_MOCK_MODE) {
      return {
        id: `tenant-activity-${Date.now()}`,
        tenantId,
        type: payload.type,
        status: payload.status ?? 'pending',
        subject: payload.subject,
        body: payload.body ?? null,
        dueAt: payload.dueAt ?? null,
        completedAt: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const result = await apiClient.post<BackendTenantActivity>(`/tenants/${tenantId}/activities`, payload);
    return mapTenantActivity(result);
  },
};
