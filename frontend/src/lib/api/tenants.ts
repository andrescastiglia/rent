import { Tenant, CreateTenantInput, UpdateTenantInput } from '@/types/tenant';
import { apiClient } from '../api';
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

// Use mock data in test/CI environments, real API in production
const IS_MOCK_MODE = process.env.NODE_ENV === 'test' || 
                     process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || 
                     process.env.CI === 'true';

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type TenantFilters = {
    name?: string;
    dni?: string;
    email?: string;
    page?: number;
    limit?: number;
};

type BackendLease = {
    id: string;
    unitId: string;
    tenantId: string;
    ownerId: string;
    startDate: string | Date;
    endDate: string | Date;
    monthlyRent?: number | null;
    securityDeposit?: number | null;
    currency?: string | null;
    status?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    unit?: {
        id: string;
        unitNumber?: string | null;
        floor?: string | null;
        bedrooms?: number | null;
        bathrooms?: number | null;
        area?: number | null;
        status?: string | null;
        baseRent?: number | null;
        property?: any;
    } | null;
};

const normalizeDate = (value: string | Date | null | undefined): string => {
    if (!value) return new Date().toISOString();
    return new Date(value).toISOString();
};

const mapLeaseStatus = (value: string | null | undefined): Lease['status'] => {
    switch ((value ?? '').toLowerCase()) {
        case 'active':
            return 'ACTIVE';
        case 'terminated':
            return 'TERMINATED';
        case 'expired':
        case 'ended':
            return 'ENDED';
        case 'draft':
        default:
            return 'DRAFT';
    }
};

const mapBackendLeaseToLease = (raw: BackendLease): Lease => {
    const unit = raw.unit ?? null;
    const property = unit?.property;

    return {
        id: raw.id,
        propertyId: unit?.propertyId ?? property?.id ?? '',
        unitId: raw.unitId,
        tenantId: raw.tenantId,
        ownerId: raw.ownerId,
        startDate: normalizeDate(raw.startDate),
        endDate: normalizeDate(raw.endDate),
        rentAmount: Number(raw.monthlyRent ?? 0),
        depositAmount: Number(raw.securityDeposit ?? 0),
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
        unit: unit
            ? {
                  id: unit.id,
                  unitNumber: unit.unitNumber ?? '',
                  floor: unit.floor ?? undefined,
                  bedrooms: Number(unit.bedrooms ?? 0),
                  bathrooms: Number(unit.bathrooms ?? 0),
                  area: Number(unit.area ?? 0),
                  status: (unit.status ?? 'available').toUpperCase() as any,
                  rentAmount: Number(unit.baseRent ?? 0),
              }
            : undefined,
    };
};

export const tenantsApi = {
    getAll: async (filters?: TenantFilters): Promise<Tenant[]> => {
        if (IS_MOCK_MODE) {
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
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_TENANTS.find((t) => t.id === id) || null;
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
        if (IS_MOCK_MODE) {
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
        if (IS_MOCK_MODE) {
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
        if (IS_MOCK_MODE) {
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
        if (IS_MOCK_MODE) {
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
