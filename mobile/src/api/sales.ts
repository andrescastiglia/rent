import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import { downloadAndSharePdf } from '@/api/pdf';
import type { SaleAgreement, SaleFolder, SaleReceipt } from '@/types/sales';
import {
  fetchPage,
  mockPage,
  type ListQuery,
  type Page,
} from '@/api/pagination';

export type SaleInstallment = {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  currency: string;
  status: 'paid' | 'partial' | 'pending' | 'overdue';
};
export type SaleSchedule = Page<SaleInstallment> & {
  asOf: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  credit: number;
  overdueAmount: number;
};
const MOCK_AGREEMENTS: SaleAgreement[] = [
  {
    id: 'agreement-1',
    folderId: 'folder-1',
    propertyId: 'property-1',
    buyerName: 'Rocio Buyer',
    buyerPhone: '+541170000005',
    totalAmount: 10000,
    currency: 'USD',
    installmentAmount: 1000,
    installmentCount: 10,
    startDate: '2026-01-01',
    dueDay: 5,
    paidAmount: 2500,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const salesApi = {
  async getFolders(): Promise<SaleFolder[]> {
    if (IS_MOCK_MODE)
      return [
        {
          id: 'folder-1',
          name: 'Loteo Las Palmas',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];
    return apiClient.get<SaleFolder[]>('/sales/folders');
  },
  async getAgreements(): Promise<SaleAgreement[]> {
    if (IS_MOCK_MODE) return MOCK_AGREEMENTS;
    return apiClient.get<SaleAgreement[]>('/sales/agreements');
  },
  async getAgreementsPage(query: ListQuery = {}): Promise<Page<SaleAgreement>> {
    if (IS_MOCK_MODE) {
      const search = String(query.search ?? '')
        .trim()
        .toLocaleLowerCase();
      const agreements = MOCK_AGREEMENTS.filter((agreement) =>
        `${agreement.buyerName} ${agreement.buyerPhone}`
          .toLocaleLowerCase()
          .includes(search),
      );
      return mockPage(agreements, query);
    }
    return fetchPage<SaleAgreement>('/sales/agreements/page', query);
  },
  async getAgreement(id: string): Promise<SaleAgreement> {
    if (IS_MOCK_MODE) {
      const result = MOCK_AGREEMENTS.find((agreement) => agreement.id === id);
      if (!result) throw new Error('Sale not found');
      return result;
    }
    return apiClient.get<SaleAgreement>(`/sales/agreements/${id}`);
  },
  async getSchedule(id: string, page = 1, limit = 20): Promise<SaleSchedule> {
    if (IS_MOCK_MODE)
      return {
        data: [],
        total: 0,
        page,
        limit,
        asOf: '2026-10-01',
        currency: 'USD',
        totalAmount: 10000,
        paidAmount: 2500,
        balance: 7500,
        credit: 0,
        overdueAmount: 0,
      };
    return apiClient.get<SaleSchedule>(
      `/sales/agreements/${id}/schedule?page=${page}&limit=${limit}`,
    );
  },
  async getReceipts(id: string): Promise<SaleReceipt[]> {
    if (IS_MOCK_MODE) return [];
    return apiClient.get<SaleReceipt[]>(`/sales/agreements/${id}/receipts`);
  },
  async downloadReceipt(id: string): Promise<void> {
    await downloadAndSharePdf({
      relativePath: `/sales/receipts/${id}/pdf`,
      filenamePrefix: `sale-${id}-receipt`,
    });
  },
};
