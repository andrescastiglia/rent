import { Tenant, CreateTenantInput, UpdateTenantInput } from '@/types/tenant';
import { apiClient } from '../api';
import { getToken } from '../auth';

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

export const tenantsApi = {
    getAll: async (): Promise<Tenant[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_TENANTS;
        }
        
        const token = getToken();
        return apiClient.get<Tenant[]>('/tenants', token ?? undefined);
    },

    getById: async (id: string): Promise<Tenant | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_TENANTS.find((t) => t.id === id) || null;
        }
        
        const token = getToken();
        try {
            return await apiClient.get<Tenant>(`/tenants/${id}`, token ?? undefined);
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
};
