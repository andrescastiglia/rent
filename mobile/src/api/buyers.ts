import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type { Buyer } from '@/types/buyer';

type BackendBuyer = Partial<Buyer> & {
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

const MOCK_BUYERS: Buyer[] = [
  {
    id: 'buyer-1',
    userId: 'buyer-user-1',
    companyId: 'company-1',
    interestedProfileId: null,
    firstName: 'Rocio',
    lastName: 'Buyer',
    email: 'buyer.demo@rent.demo',
    phone: '+54 11 7000-0005',
    dni: '32123456',
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mapBuyer = (raw: BackendBuyer): Buyer => ({
  id: raw.id ?? '',
  userId: raw.userId ?? raw.user?.id ?? undefined,
  companyId: raw.companyId ?? undefined,
  interestedProfileId: raw.interestedProfileId ?? null,
  firstName: raw.firstName ?? raw.user?.firstName ?? '',
  lastName: raw.lastName ?? raw.user?.lastName ?? '',
  email: raw.email ?? raw.user?.email ?? null,
  phone: raw.phone ?? raw.user?.phone ?? null,
  dni: raw.dni ?? null,
  notes: raw.notes ?? null,
  createdAt: raw.createdAt ?? new Date().toISOString(),
  updatedAt: raw.updatedAt ?? new Date().toISOString(),
});

export const buyersApi = {
  async getAll(filters?: {
    name?: string;
    email?: string;
    phone?: string;
    limit?: number;
  }): Promise<Buyer[]> {
    if (IS_MOCK_MODE) {
      const term = filters?.name?.trim().toLowerCase() ?? '';
      return MOCK_BUYERS.filter((buyer) => {
        if (!term) {
          return true;
        }

        return `${buyer.firstName} ${buyer.lastName}`
          .toLowerCase()
          .includes(term);
      });
    }

    const query = new URLSearchParams();
    if (filters?.name?.trim()) query.set('name', filters.name.trim());
    if (filters?.email?.trim()) query.set('email', filters.email.trim());
    if (filters?.phone?.trim()) query.set('phone', filters.phone.trim());
    if (filters?.limit) query.set('limit', String(filters.limit));

    const endpoint =
      query.toString().length > 0 ? `/buyers?${query.toString()}` : '/buyers';
    const result = await apiClient.get<
      | BackendBuyer[]
      | { data: BackendBuyer[]; total: number; page: number; limit: number }
    >(endpoint);

    return Array.isArray(result)
      ? result.map(mapBuyer)
      : result.data.map(mapBuyer);
  },

  async getById(id: string): Promise<Buyer | null> {
    if (IS_MOCK_MODE) {
      return MOCK_BUYERS.find((buyer) => buyer.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<BackendBuyer>(`/buyers/${id}`);
      return mapBuyer(result);
    } catch {
      return null;
    }
  },
};
