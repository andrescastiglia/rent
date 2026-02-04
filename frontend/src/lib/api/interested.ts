import { apiClient } from '../api';
import { getToken } from '../auth';
import {
    InterestedProfile,
    CreateInterestedProfileInput,
    UpdateInterestedProfileInput,
    InterestedFilters,
} from '@/types/interested';
import { Property } from '@/types/property';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

const MOCK_INTERESTED: InterestedProfile[] = [
    {
        id: 'int-1',
        firstName: 'Lucia',
        lastName: 'Perez',
        phone: '+54 9 11 5555-1111',
        peopleCount: 3,
        maxAmount: 120000,
        hasPets: true,
        whiteIncome: true,
        guaranteeTypes: ['Garantía propietaria'],
        propertyTypePreference: 'house',
        operation: 'sale',
        notes: 'Busca casa con patio',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const IS_MOCK_MODE = process.env.NODE_ENV === 'test' || 
                     process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || 
                     process.env.CI === 'true';

const DELAY = 400;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const interestedApi = {
    getAll: async (filters?: InterestedFilters): Promise<PaginatedResponse<InterestedProfile>> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            let data = [...MOCK_INTERESTED];
            if (filters?.name) {
                const term = filters.name.toLowerCase();
                data = data.filter((p) =>
                    `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase().includes(term),
                );
            }
            if (filters?.phone) {
                data = data.filter((p) => p.phone.includes(filters.phone!));
            }
            if (filters?.operation) {
                data = data.filter((p) => p.operation === filters.operation);
            }
            if (filters?.propertyTypePreference) {
                data = data.filter((p) => p.propertyTypePreference === filters.propertyTypePreference);
            }
            return { data, total: data.length, page: 1, limit: 10 };
        }

        const token = getToken();
        const queryParams = new URLSearchParams();
        if (filters?.name) queryParams.append('name', filters.name);
        if (filters?.phone) queryParams.append('phone', filters.phone);
        if (filters?.operation) queryParams.append('operation', filters.operation);
        if (filters?.propertyTypePreference) queryParams.append('propertyTypePreference', filters.propertyTypePreference);
        if (filters?.page) queryParams.append('page', String(filters.page));
        if (filters?.limit) queryParams.append('limit', String(filters.limit));

        const endpoint = queryParams.toString().length > 0 ? `/interested?${queryParams.toString()}` : '/interested';
        return apiClient.get<PaginatedResponse<InterestedProfile>>(endpoint, token ?? undefined);
    },

    create: async (data: CreateInterestedProfileInput): Promise<InterestedProfile> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const newProfile: InterestedProfile = {
                ...data,
                id: `int-${Math.random().toString(36).slice(2)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            MOCK_INTERESTED.unshift(newProfile);
            return newProfile;
        }

        const token = getToken();
        return apiClient.post<InterestedProfile>('/interested', data, token ?? undefined);
    },

    update: async (id: string, data: UpdateInterestedProfileInput): Promise<InterestedProfile> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_INTERESTED.findIndex((p) => p.id === id);
            if (index === -1) throw new Error('Interested profile not found');
            MOCK_INTERESTED[index] = { ...MOCK_INTERESTED[index], ...data, updatedAt: new Date().toISOString() };
            return MOCK_INTERESTED[index];
        }

        const token = getToken();
        return apiClient.patch<InterestedProfile>(`/interested/${id}`, data, token ?? undefined);
    },

    remove: async (id: string): Promise<void> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_INTERESTED.findIndex((p) => p.id === id);
            if (index !== -1) MOCK_INTERESTED.splice(index, 1);
            return;
        }

        const token = getToken();
        await apiClient.delete(`/interested/${id}`, token ?? undefined);
    },

    getMatches: async (id: string): Promise<Property[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return [];
        }

        const token = getToken();
        return apiClient.get<Property[]>(`/interested/${id}/matches`, token ?? undefined);
    },
};
