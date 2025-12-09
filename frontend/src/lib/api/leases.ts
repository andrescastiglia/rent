import { Lease, CreateLeaseInput, UpdateLeaseInput } from '@/types/lease';
import { apiClient } from '../api';
import { getToken } from '../auth';
import { propertiesApi } from './properties';
import { tenantsApi } from './tenants';

// Mock data for development/testing
const MOCK_LEASES: Lease[] = [
    {
        id: '1',
        propertyId: '1',
        unitId: 'u1',
        tenantId: '1',
        ownerId: 'owner-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        rentAmount: 1500,
        depositAmount: 3000,
        currency: 'ARS',
        currencyData: { code: 'ARS', symbol: '$', decimalPlaces: 2, isActive: true },
        status: 'ACTIVE',
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        propertyId: '2',
        unitId: 'u2',
        tenantId: '2',
        ownerId: 'owner-2',
        startDate: '2024-03-01',
        endDate: '2025-02-28',
        rentAmount: 2000,
        depositAmount: 4000,
        currency: 'USD',
        currencyData: { code: 'USD', symbol: 'US$', decimalPlaces: 2, isActive: true },
        status: 'DRAFT',
        documents: [],
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

export const leasesApi = {
    getAll: async (): Promise<Lease[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            // Enrich with related data for list view
            const leasesWithRelations = await Promise.all(MOCK_LEASES.map(async (lease) => {
                const property = await propertiesApi.getById(lease.propertyId);
                const tenant = await tenantsApi.getById(lease.tenantId);
                return { ...lease, property: property || undefined, tenant: tenant || undefined };
            }));
            return leasesWithRelations;
        }
        
        const token = getToken();
        return apiClient.get<Lease[]>('/leases', token ?? undefined);
    },

    getById: async (id: string): Promise<Lease | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const lease = MOCK_LEASES.find((l) => l.id === id);
            if (!lease) return null;

            const property = await propertiesApi.getById(lease.propertyId);
            const tenant = await tenantsApi.getById(lease.tenantId);
            return { ...lease, property: property || undefined, tenant: tenant || undefined };
        }
        
        const token = getToken();
        try {
            return await apiClient.get<Lease>(`/leases/${id}`, token ?? undefined);
        } catch {
            return null;
        }
    },

    create: async (data: CreateLeaseInput): Promise<Lease> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const newLease: Lease = {
                ...data,
                id: Math.random().toString(36).substr(2, 9),
                documents: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            MOCK_LEASES.push(newLease);
            return newLease;
        }
        
        const token = getToken();
        return apiClient.post<Lease>('/leases', data, token ?? undefined);
    },

    update: async (id: string, data: UpdateLeaseInput): Promise<Lease> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_LEASES.findIndex((l) => l.id === id);
            if (index === -1) throw new Error('Lease not found');

            const updatedLease = {
                ...MOCK_LEASES[index],
                ...data,
                updatedAt: new Date().toISOString(),
            };
            MOCK_LEASES[index] = updatedLease;
            return updatedLease;
        }
        
        const token = getToken();
        return apiClient.patch<Lease>(`/leases/${id}`, data, token ?? undefined);
    },

    delete: async (id: string): Promise<void> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_LEASES.findIndex((l) => l.id === id);
            if (index !== -1) {
                MOCK_LEASES.splice(index, 1);
            }
            return;
        }
        
        const token = getToken();
        await apiClient.delete(`/leases/${id}`, token ?? undefined);
    },
};
