import { Tenant, CreateTenantInput, UpdateTenantInput } from '@/types/tenant';
import { apiClient, IS_MOCK_MODE } from '../api';
import { getToken } from '../auth';
import type { Lease } from '@/types/lease';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

type BackendTenantLike = {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    isActive?: boolean | null;
    dni?: string | null;
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

const isPaginatedResponse = <T,>(value: any): value is PaginatedResponse<T> => {
    return !!value && typeof value === 'object' && Array.isArray(value.data);
};

const mapBackendTenantToTenant = (raw: BackendTenantLike): Tenant => {
    const user = raw.user ?? null;
    const firstName = (raw.firstName ?? user?.firstName ?? '') as string;
    const lastName = (raw.lastName ?? user?.lastName ?? '') as string;
    const email = (raw.email ?? user?.email ?? '') as string;
    const phone = (raw.phone ?? user?.phone ?? '') as string;
    const isActive = raw.isActive ?? user?.isActive ?? true;

    return {
        id: raw.id,
        firstName,
        lastName,
        email,
        phone,
        dni: (raw.dni ?? raw.id) as string,
        status: isActive ? 'ACTIVE' : 'INACTIVE',
        createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
    };
};

// Mock data for development/testing
const MOCK_TENANTS: Tenant[] = [
    {
        id: '1',
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan.perez@example.com',
        phone: '+54 9 11 1234-5678',
        dni: '12345678',
        status: 'ACTIVE',
        address: {
            street: 'Av. Corrientes',
            number: '1000',
            city: 'Buenos Aires',
            state: 'CABA',
            zipCode: '1000',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        firstName: 'María',
        lastName: 'Gómez',
        email: 'maria.gomez@example.com',
        phone: '+54 9 11 8765-4321',
        dni: '87654321',
        status: 'PROSPECT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldUseMock = (): boolean => {
    // In client-side e2e/dev runs, mock auth issues a predictable token prefix.
    // This prevents situations where auth is mocked but other API modules accidentally hit the real backend.
    return IS_MOCK_MODE || (getToken()?.startsWith('mock-token-') ?? false);
};

type TenantFilters = {
    name?: string;
    dni?: string;
    email?: string;
    page?: number;
    limit?: number;
};

type BackendLease = {
    id: string;
    propertyId?: string | null;
    tenantId?: string | null;
    ownerId: string;
    contractType?: 'rental' | 'sale' | null;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    monthlyRent?: number | null;
    fiscalValue?: number | null;
    securityDeposit?: number | null;
    currency?: string | null;
    status?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    property?: any;
};

const normalizeDate = (value: string | Date | null | undefined): string => {
    if (!value) return new Date().toISOString();
    return new Date(value).toISOString();
};

const mapLeaseStatus = (value: string | null | undefined): Lease['status'] => {
    switch ((value ?? '').toLowerCase()) {
        case 'active':
            return 'ACTIVE';
        case 'finalized':
            return 'FINALIZED';
        case 'draft':
        default:
            return 'DRAFT';
    }
};

const mapBackendLeaseToLease = (raw: BackendLease): Lease => {
    const property = raw.property;

    return {
        id: raw.id,
        propertyId: raw.propertyId ?? property?.id ?? '',
        tenantId: raw.tenantId ?? undefined,
        ownerId: raw.ownerId,
        contractType: raw.contractType ?? 'rental',
        startDate: raw.startDate ? normalizeDate(raw.startDate) : undefined,
        endDate: raw.endDate ? normalizeDate(raw.endDate) : undefined,
        rentAmount:
            raw.monthlyRent === null || raw.monthlyRent === undefined
                ? undefined
                : Number(raw.monthlyRent),
        depositAmount: Number(raw.securityDeposit ?? 0),
        fiscalValue:
            raw.fiscalValue === null || raw.fiscalValue === undefined
                ? undefined
                : Number(raw.fiscalValue),
        currency: raw.currency ?? 'ARS',
        status: mapLeaseStatus(raw.status),
        documents: [],
        createdAt: normalizeDate(raw.createdAt),
        updatedAt: normalizeDate(raw.updatedAt),
        property: property
            ? {
                  id: property.id,
                  name: property.name ?? '',
                  description: property.description ?? undefined,
                  type: 'OTHER',
                  status: 'ACTIVE',
                  address: {
                      street: property.addressStreet ?? '',
                      number: property.addressNumber ?? '',
                      unit: undefined,
                      city: property.addressCity ?? '',
                      state: property.addressState ?? '',
                      zipCode: property.addressPostalCode ?? '',
                      country: property.addressCountry ?? 'Argentina',
                  },
                  features: [],
                  units: [],
                  images: Array.isArray(property.images)
                      ? property.images
                            .map((img: any) => (typeof img === 'string' ? img : img?.url))
                            .filter((v: any) => typeof v === 'string' && v.length > 0)
                      : [],
                  ownerId: property.ownerId ?? raw.ownerId,
                  createdAt: property.createdAt
                      ? new Date(property.createdAt).toISOString()
                      : new Date().toISOString(),
                  updatedAt: property.updatedAt
                      ? new Date(property.updatedAt).toISOString()
                      : new Date().toISOString(),
              }
            : undefined,
    };
};

export const tenantsApi = {
    getAll: async (filters?: TenantFilters): Promise<Tenant[]> => {
        if (shouldUseMock()) {
            await delay(DELAY);
            if (!filters?.name) {
                return MOCK_TENANTS;
            }
            const term = filters.name.toLowerCase();
            return MOCK_TENANTS.filter((tenant) =>
                tenant.lastName.toLowerCase().includes(term),
            );
        }
        
        const token = getToken();
        const queryParams = new URLSearchParams();
        if (filters?.name) queryParams.append('name', filters.name);
        if (filters?.dni) queryParams.append('dni', filters.dni);
        if (filters?.email) queryParams.append('email', filters.email);
        if (filters?.page) queryParams.append('page', String(filters.page));
        if (filters?.limit) queryParams.append('limit', String(filters.limit));

        const endpoint = queryParams.toString().length > 0 ? `/tenants?${queryParams.toString()}` : '/tenants';
        const result = await apiClient.get<PaginatedResponse<BackendTenantLike> | BackendTenantLike[] | any>(
            endpoint,
            token ?? undefined,
        );

        if (Array.isArray(result)) {
            return result.map(mapBackendTenantToTenant);
        }

        if (isPaginatedResponse<BackendTenantLike>(result)) {
            return result.data.map(mapBackendTenantToTenant);
        }

        throw new Error('Unexpected response shape from /tenants');
    },

    getById: async (id: string): Promise<Tenant | null> => {
        if (shouldUseMock()) {
            await delay(DELAY);
            const normalizedId = decodeURIComponent(id).split('?')[0];
            return MOCK_TENANTS.find((t) => t.id === normalizedId) || MOCK_TENANTS[0] || null;
        }
        
        const token = getToken();
        try {
            const result = await apiClient.get<BackendTenantLike>(`/tenants/${id}`, token ?? undefined);
            return mapBackendTenantToTenant(result);
        } catch {
            return null;
        }
    },

    create: async (data: CreateTenantInput): Promise<Tenant> => {
        if (shouldUseMock()) {
            await delay(DELAY);
            const newTenant: Tenant = {
                ...data,
                id: Math.random().toString(36).substr(2, 9),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            MOCK_TENANTS.push(newTenant);
            return newTenant;
        }
        
        const token = getToken();
        return apiClient.post<Tenant>('/tenants', data, token ?? undefined);
    },

    update: async (id: string, data: UpdateTenantInput): Promise<Tenant> => {
        if (shouldUseMock()) {
            await delay(DELAY);
            const index = MOCK_TENANTS.findIndex((t) => t.id === id);
            if (index === -1) throw new Error('Tenant not found');

            const updatedTenant = {
                ...MOCK_TENANTS[index],
                ...data,
                updatedAt: new Date().toISOString(),
            };
            MOCK_TENANTS[index] = updatedTenant;
            return updatedTenant;
        }
        
        const token = getToken();
        return apiClient.patch<Tenant>(`/tenants/${id}`, data, token ?? undefined);
    },

    delete: async (id: string): Promise<void> => {
        if (shouldUseMock()) {
            await delay(DELAY);
            const index = MOCK_TENANTS.findIndex((t) => t.id === id);
            if (index !== -1) {
                MOCK_TENANTS.splice(index, 1);
            }
            return;
        }
        
        const token = getToken();
        await apiClient.delete(`/tenants/${id}`, token ?? undefined);
    },

    getLeaseHistory: async (id: string): Promise<Lease[]> => {
        if (shouldUseMock()) {
            await delay(DELAY);
            return [];
        }

        const token = getToken();
        const result = await apiClient.get<BackendLease[]>(
            `/tenants/${id}/leases`,
            token ?? undefined,
        );
        return Array.isArray(result) ? result.map(mapBackendLeaseToLease) : [];
    },
};
