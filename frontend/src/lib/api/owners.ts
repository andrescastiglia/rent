import { Owner } from '@/types/owner';
import { apiClient } from '../api';
import { getToken } from '../auth';

// Mock data for development/testing
const MOCK_OWNERS: Owner[] = [
    {
        id: '1',
        userId: 'user-1',
        companyId: 'company-1',
        firstName: 'Carlos',
        lastName: 'Rodríguez',
        email: 'carlos.rodriguez@example.com',
        phone: '+54 9 11 5555-1234',
        taxId: '20-12345678-9',
        taxIdType: 'CUIT',
        bankName: 'Banco Nación',
        bankCbu: '0110000000000000000001',
        bankAlias: 'carlos.rodriguez',
        paymentMethod: 'bank_transfer',
        commissionRate: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        userId: 'user-2',
        companyId: 'company-1',
        firstName: 'Ana',
        lastName: 'Martínez',
        email: 'ana.martinez@example.com',
        phone: '+54 9 11 5555-5678',
        taxId: '27-98765432-1',
        taxIdType: 'CUIT',
        bankName: 'Banco Galicia',
        bankCbu: '0110000000000000000002',
        bankAlias: 'ana.martinez.alquileres',
        paymentMethod: 'bank_transfer',
        commissionRate: 8,
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

export const ownersApi = {
    getAll: async (): Promise<Owner[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_OWNERS;
        }
        
        const token = getToken();
        return apiClient.get<Owner[]>('/owners', token ?? undefined);
    },

    getById: async (id: string): Promise<Owner | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_OWNERS.find((o) => o.id === id) || null;
        }
        
        const token = getToken();
        try {
            return await apiClient.get<Owner>(`/owners/${id}`, token ?? undefined);
        } catch {
            return null;
        }
    },
};
