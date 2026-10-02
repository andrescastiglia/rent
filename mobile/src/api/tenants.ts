import {
  fetchAllPages,
  fetchPage,
  mockPage,
  type ListQuery,
  type Page,
} from '@/api/pagination';
import { ApiError, apiClient } from '@/api/client';
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

type BackendTenant = Partial<
  Omit<
    Tenant,
    | 'id'
    | 'monthlyIncome'
    | 'dateOfBirth'
    | 'creditScoreDate'
    | 'createdAt'
    | 'updatedAt'
  >
> & {
  id: string;
  tenantEntityId?: string;
  monthlyIncome?: number | string | null;
  dateOfBirth?: string | Date | null;
  creditScoreDate?: string | Date | null;
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

const toIso = (value?: string | Date): string =>
  value ? new Date(value).toISOString() : new Date().toISOString();
const toIsoNullable = (value?: string | Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

const statusFromIsActive = (isActive?: boolean | null): TenantStatus =>
  (isActive ?? true) ? 'ACTIVE' : 'INACTIVE';

const mapTenant = (raw: BackendTenant): Tenant => {
  const user = raw.user ?? null;
  return {
    id: raw.tenantEntityId ?? raw.id,
    firstName: raw.firstName ?? user?.firstName ?? '',
    lastName: raw.lastName ?? user?.lastName ?? '',
    email: raw.email ?? user?.email ?? '',
    phone: raw.phone ?? user?.phone ?? '',
    dni: raw.dni ?? '',
    cuil: raw.cuil ?? undefined,
    dateOfBirth: raw.dateOfBirth
      ? toIso(raw.dateOfBirth).slice(0, 10)
      : undefined,
    nationality: raw.nationality ?? undefined,
    occupation: raw.occupation ?? undefined,
    employer: raw.employer ?? undefined,
    monthlyIncome:
      raw.monthlyIncome == null ? undefined : Number(raw.monthlyIncome),
    employmentStatus: raw.employmentStatus ?? undefined,
    emergencyContactName: raw.emergencyContactName ?? undefined,
    emergencyContactPhone: raw.emergencyContactPhone ?? undefined,
    emergencyContactRelationship: raw.emergencyContactRelationship ?? undefined,
    creditScore: raw.creditScore ?? undefined,
    creditScoreDate: raw.creditScoreDate
      ? toIso(raw.creditScoreDate).slice(0, 10)
      : undefined,
    notes: raw.notes ?? undefined,
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

const toCreatePayload = (value: CreateTenantInput | UpdateTenantInput) => ({
  companyId: value.companyId,
  password: value.password,
  firstName: value.firstName,
  lastName: value.lastName,
  email: value.email,
  phone: value.phone,
  dni: value.dni,
  cuil: value.cuil,
  dateOfBirth: value.dateOfBirth,
  nationality: value.nationality,
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

const toUpdatePayload = (value: UpdateTenantInput) => {
  const { password: _, ...payload } = toCreatePayload(value);
  return payload;
};

export const tenantsApi = {
  async getAll(filters?: TenantFilters): Promise<Tenant[]> {
    if (IS_MOCK_MODE) {
      if (!filters?.name) {
        return [...MOCK_TENANTS];
      }

      const needle = filters.name.trim().toLowerCase();
      return MOCK_TENANTS.filter((item) =>
        `${item.firstName} ${item.lastName} ${item.email} ${item.phone}`
          .toLowerCase()
          .includes(needle),
      );
    }

    return fetchAllPages<BackendTenant, Tenant>(
      '/tenants',
      { ...filters },
      mapTenant,
    );
  },

  async getPage(query: ListQuery = {}): Promise<Page<Tenant>> {
    if (IS_MOCK_MODE) {
      const term = String(query.name ?? query.search ?? '').toLowerCase();
      return mockPage(
        MOCK_TENANTS.filter((tenant) =>
          `${tenant.firstName} ${tenant.lastName} ${tenant.email}`
            .toLowerCase()
            .includes(term),
        ),
        query,
      );
    }
    return fetchPage<BackendTenant, Tenant>('/tenants', query, mapTenant);
  },

  async getById(id: string): Promise<Tenant | null> {
    if (IS_MOCK_MODE) {
      return MOCK_TENANTS.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<BackendTenant>(`/tenants/${id}`);
      return mapTenant(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
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

    const result = await apiClient.post<BackendTenant>(
      '/tenants',
      toCreatePayload(payload),
    );
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

    const result = await apiClient.patch<BackendTenant>(
      `/tenants/${id}`,
      toUpdatePayload(payload),
    );
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

    const result = await apiClient.post<BackendTenantActivity>(
      `/tenants/${tenantId}/activities`,
      payload,
    );
    return mapTenantActivity(result);
  },
};
